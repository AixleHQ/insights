# frozen_string_literal: true

module Api
  module V1
    class WebhooksController < ApplicationController
      skip_before_action :authenticate_user!
      skip_before_action :set_current_organization

      before_action :verify_signature!

      # POST /api/v1/webhooks/:provider/:connector_id
      def receive
        provider = params[:provider]
        connector_id = params[:connector_id]

        connector = OrganizationConnector.find(connector_id)

        unless connector.connector_type == provider
          return render json: { error: "Provider mismatch" }, status: :bad_request
        end

        # Parse webhook payload
        payload = parse_payload

        # Store raw webhook
        raw_key = store_raw_webhook(connector, payload)

        # Route to appropriate handler
        result = route_webhook(provider, connector, payload, raw_key)

        render json: {
          data: {
            received: true,
            event_type: result[:event_type],
            workflow_id: result[:workflow_id]
          }
        }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Connector not found" }, status: :not_found
      rescue Webhooks::SignatureInvalidError => e
        render json: { error: "Invalid signature", message: e.message }, status: :unauthorized
      rescue Webhooks::SignatureMissingError => e
        render json: { error: "Missing signature", message: e.message }, status: :bad_request
      rescue StandardError => e
        Rails.logger.error "[Webhooks] Processing failed: #{e.message}"
        render json: { error: "Processing failed", message: e.message }, status: :unprocessable_entity
      end

      private

      def verify_signature!
        provider = params[:provider]
        connector_id = params[:connector_id]

        connector = OrganizationConnector.find_by(id: connector_id)
        return render json: { error: "Connector not found" }, status: :not_found unless connector

        secret = connector.webhook_secret
        return if secret.blank? # Skip verification if no secret configured

        verifier = Webhooks::SignatureVerifier.for(provider)
        signature = verifier.extract_signature(request)

        verifier.verify!(
          payload: request.raw_post,
          signature: signature,
          secret: secret
        )
      end

      def parse_payload
        case request.content_type
        when %r{application/json}
          JSON.parse(request.raw_post)
        when %r{application/x-www-form-urlencoded}
          params.to_unsafe_h.except(:controller, :action, :provider, :connector_id)
        else
          { raw: request.raw_post }
        end
      end

      def store_raw_webhook(connector, payload)
        RawEventStore.store(
          organization_id: connector.organization_id,
          payload: payload.to_json,
          content_type: "application/json",
          prefix: "webhooks/#{connector.connector_type}"
        )
      end

      def route_webhook(provider, connector, payload, raw_key)
        event_type = extract_event_type(provider, payload)

        case provider
        when "github"
          handle_github_webhook(connector, payload, event_type, raw_key)
        when "gitlab"
          handle_gitlab_webhook(connector, payload, event_type, raw_key)
        when "bitbucket"
          handle_bitbucket_webhook(connector, payload, event_type, raw_key)
        when "jira"
          handle_jira_webhook(connector, payload, event_type, raw_key)
        when "linear"
          handle_linear_webhook(connector, payload, event_type, raw_key)
        else
          { event_type: "unknown", workflow_id: nil }
        end
      end

      def extract_event_type(provider, payload)
        case provider
        when "github"
          request.headers["X-GitHub-Event"] || payload["action"]
        when "gitlab"
          request.headers["X-Gitlab-Event"] || payload["object_kind"]
        when "bitbucket"
          request.headers["X-Event-Key"]
        when "jira"
          payload.dig("webhookEvent") || payload.dig("issue_event_type_name")
        when "linear"
          payload["type"] || payload["action"]
        else
          "unknown"
        end
      end

      def handle_github_webhook(connector, payload, event_type, raw_key)
        # Queue job to process GitHub webhook
        GithubSyncJob.perform_later(
          connector.id,
          "webhook",
          event_type: event_type,
          payload: payload,
          raw_key: raw_key
        )

        { event_type: event_type, workflow_id: nil }
      end

      def handle_gitlab_webhook(connector, payload, event_type, raw_key)
        GitlabSyncJob.perform_later(
          connector.id,
          "webhook",
          event_type: event_type,
          payload: payload,
          raw_key: raw_key
        )

        { event_type: event_type, workflow_id: nil }
      end

      def handle_bitbucket_webhook(connector, payload, event_type, raw_key)
        BitbucketSyncJob.perform_later(
          connector.id,
          "webhook",
          event_type: event_type,
          payload: payload,
          raw_key: raw_key
        )

        { event_type: event_type, workflow_id: nil }
      end

      def handle_jira_webhook(connector, payload, event_type, raw_key)
        JiraSyncJob.perform_later(
          connector.id,
          "webhook",
          event_type: event_type,
          payload: payload,
          raw_key: raw_key
        )

        { event_type: event_type, workflow_id: nil }
      end

      def handle_linear_webhook(connector, payload, event_type, raw_key)
        LinearSyncJob.perform_later(
          connector.id,
          "webhook",
          event_type: event_type,
          payload: payload,
          raw_key: raw_key
        )

        { event_type: event_type, workflow_id: nil }
      end
    end
  end
end
