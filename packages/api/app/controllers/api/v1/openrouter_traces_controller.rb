# frozen_string_literal: true

module Api
  module V1
    # Receives OpenRouter Broadcast Webhook traces in OTLP JSON format.
    #
    # OpenRouter sends a POST after every API request made through a connector
    # that has Broadcast > Webhook enabled in its OpenRouter account settings.
    # The payload is an OTLP resourceSpans envelope; each span corresponds to
    # one generation (one API call).
    #
    # Route: POST /api/v1/webhooks/openrouter_traces/:webhook_token
    # Auth: public endpoint — no Keycloak JWT required.
    #       Connector is resolved via :webhook_token in the URL path.
    #       Each OpenRouter connector gets a unique webhook_token on creation.
    #       Optional HMAC signature verification when connector.webhook_secret is set.
    class OpenrouterTracesController < ApplicationController
      skip_before_action :authenticate_user!
      skip_before_action :set_current_organization

      # OpenRouter passes custom headers verbatim — no HMAC signing.
      # Users set this header in OpenRouter's "Headers" field with their own secret value.
      SIGNATURE_HEADER = "X-Webhook-Secret"
      TEST_CONNECTION_HEADER = "X-Test-Connection"

      # POST /api/v1/webhooks/openrouter_traces/:webhook_token
      def receive
        # OpenRouter sends a test request on webhook setup — acknowledge and stop.
        if request.headers[TEST_CONNECTION_HEADER] == "true"
          return render json: { received: true }, status: :ok
        end

        connector = OrganizationConnector
                      .by_webhook_token(params[:webhook_token])
                      .where(connector_type: "openrouter", is_active: true)
                      .first

        unless connector
          # Return 200 so OpenRouter doesn't retry unknown-token payloads.
          # AIX-716: log nothing derived from :webhook_token — it is the sole
          # authenticator for this endpoint, which is JWT-excluded and therefore
          # reachable unauthenticated, so any caller can drive this line at will.
          # request_id is unique per request and safe to write, which keeps the
          # line useful for correlating a burst without disclosing a credential.
          Rails.logger.warn("[OpenrouterTraces] No active connector for the supplied webhook token (request_id=#{request.request_id})")
          return render json: { received: true }, status: :ok
        end

        payload = parse_otlp_payload
        return render json: { error: "Invalid payload" }, status: :bad_request if payload.nil?

        # OpenRouter doesn't sign requests with HMAC — it forwards custom headers
        # verbatim. If the connector has a webhook_secret configured, we expect it
        # to arrive in X-Webhook-Secret (set by the user in OpenRouter's Headers field).
        verify_secret!(connector) if connector.webhook_secret.present?

        OpenrouterTraceJob.perform_async(connector.id, payload.to_json)

        render json: { received: true }, status: :accepted
      rescue InvalidSignatureError => e
        render json: { error: "Invalid signature", message: e.message }, status: :unauthorized
      rescue ActionDispatch::Http::Parameters::ParseError
        render json: { error: "Invalid payload" }, status: :bad_request
      rescue StandardError => e
        Rails.logger.error("[OpenrouterTraces] Unexpected error: #{e.class} #{e.message}")
        render json: { error: "Processing failed" }, status: :internal_server_error
      end

      private

      InvalidSignatureError = Class.new(StandardError)

      def parse_otlp_payload
        return nil unless request.content_type&.include?("application/json")
        JSON.parse(request.raw_post)
      rescue JSON::ParserError
        nil
      end

      def verify_secret!(connector)
        incoming = request.headers[SIGNATURE_HEADER].to_s
        raise InvalidSignatureError, "Missing #{SIGNATURE_HEADER} header" if incoming.blank?

        unless ActiveSupport::SecurityUtils.secure_compare(connector.webhook_secret, incoming)
          raise InvalidSignatureError, "Secret mismatch"
        end
      end
    end
  end
end
