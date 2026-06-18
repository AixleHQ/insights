# frozen_string_literal: true

module Api
  module V1
    class OrganizationConnectorsController < BaseController
      before_action :require_organization!
      before_action :set_connector, only: %i[show update destroy test sync available_repos available_projects sync_status]

      # GET /api/v1/organizations/:organization_id/connectors
      def index
        connectors = current_organization.organization_connectors.order(:connector_type)
        authorize! connectors.new

        # Allow filtering by type
        connectors = connectors.by_type(params[:type]) if params[:type].present?
        connectors = connectors.active if params[:active] == "true"

        render_collection(connectors, OrganizationConnectorSerializer, serializer_params: { collection: true })
      end

      # GET /api/v1/organizations/:organization_id/connectors/:id
      def show
        authorize! @connector
        render_resource(@connector, OrganizationConnectorSerializer)
      end

      # POST /api/v1/organizations/:organization_id/connectors
      def create
        @connector = current_organization.organization_connectors.new(connector_params)
        authorize! @connector

        if @connector.ai_provider? || @connector.slack_webhook? || @connector.cursor?
          provider = Oauth::BaseProvider.for(@connector)
          result = provider.test_connection
          unless result[:success]
            return render json: {
              error: "Unprocessable Entity",
              errors: { access_token: [ result[:error] || "Invalid API key" ] }
            }, status: :unprocessable_content
          end
        end

        if @connector.save
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: "connector.create",
            resource: @connector,
            tracked_changes: { connector_type: @connector.connector_type },
            request: request
          )
          render_created(@connector, OrganizationConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@connector.errors)
          }, status: :unprocessable_content
        end
      end

      # PATCH /api/v1/organizations/:organization_id/connectors/:id
      def update
        authorize! @connector

        changes_before = @connector.slice(:is_active, :status, :external_account_name)

        attrs = connector_update_params.to_h.stringify_keys

        if (incoming_config = attrs.delete("config")).present?
          if incoming_config["linked_project_id"].is_a?(String) && incoming_config["linked_project_id"].strip.empty?
            incoming_config["linked_project_id"] = nil
          end

          if @connector.source_control? && (linked_id = incoming_config["linked_project_id"]).present?
            unless current_organization.projects.exists?(id: linked_id)
              return render json: {
                error: "Unprocessable Entity",
                errors: { linked_project_id: [ "must belong to the current organization" ] }
              }, status: :unprocessable_content
            end
          end

          attrs["config"] = merge_connector_config(incoming_config) if @connector.source_control?

          if @connector.source_control? && incoming_config.key?("webhook_enabled")
            attrs["webhook_active"] = ActiveModel::Type::Boolean.new.cast(incoming_config["webhook_enabled"])
          end
        end

        if @connector.update(attrs)
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: "connector.update",
            resource: @connector,
            tracked_changes: { before: changes_before, after: @connector.slice(:is_active, :status, :external_account_name) },
            request: request
          )
          render_resource(@connector, OrganizationConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@connector.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/organizations/:organization_id/connectors/:id
      def destroy
        authorize! @connector

        connector_type = @connector.connector_type
        @connector.destroy!

        OrganizationAuditLog.log(
          organization: current_organization,
          actor: current_user,
          action: "connector.delete",
          resource: @connector,
          tracked_changes: { connector_type: connector_type },
          request: request
        )

        render_no_content
      end

      # POST /api/v1/organizations/:organization_id/connectors/:id/test
      def test
        authorize! @connector, to: :test?

        # Mark testing immediately so concurrent readers see the in-progress state.
        # Note: if this process is killed before the provider call completes, the
        # connector will remain in "testing". A background cleanup job or Temporal
        # workflow should reset connectors stuck in this state beyond a timeout.
        @connector.mark_testing!
        provider = Oauth::BaseProvider.for(@connector)
        result = provider.test_connection

        if result[:success]
          @connector.mark_connected!
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: "connector.test",
            resource: @connector,
            tracked_changes: { connector_type: @connector.connector_type, success: true },
            request: request
          )
          render json: { data: { success: true, message: "Connection successful" } }
        else
          @connector.mark_error!(result[:error])
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: "connector.test",
            resource: @connector,
            tracked_changes: { connector_type: @connector.connector_type, success: false, error: result[:error] },
            request: request
          )
          render json: { data: { success: false, error: result[:error] } }, status: :ok
        end
      rescue ActionPolicy::Unauthorized
        raise
      rescue StandardError => e
        @connector.mark_error!(e.message)
        render json: { data: { success: false, error: e.message } }, status: :ok
      end

      # GET /api/v1/organizations/:organization_id/connectors/:id/available_repos
      def available_repos
        authorize! @connector, to: :available_repos?

        provider = Oauth::BaseProvider.for(@connector)
        repos = provider.fetch_repositories(
          page: params.fetch(:page, 1).to_i,
          per_page: params.fetch(:per_page, 50).to_i
        )

        linked_ids = @connector.repositories.linked.pluck(:external_id).to_set
        repos = repos.map do |r|
          r.merge(already_linked: linked_ids.include?(r[:external_id]))
           .transform_keys { |k| k.to_s.camelize(:lower) }
        end

        render json: { data: repos }
      rescue ActionPolicy::Unauthorized
        raise
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_content
      end

      # GET /api/v1/organizations/:organization_id/connectors/:id/available_projects
      def available_projects
        authorize! @connector, to: :available_projects?

        provider = Oauth::BaseProvider.for(@connector)
        projects = provider.fetch_projects.map do |p|
          p.transform_keys { |k| k.to_s.camelize(:lower) }
        end
        render json: { data: projects }
      rescue ActionPolicy::Unauthorized
        raise
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_content
      end

      # POST /api/v1/organizations/:organization_id/connectors/:id/sync
      def sync
        authorize! @connector, to: :sync?

        @connector.mark_testing!
        ConnectorSyncService.enqueue(@connector)
        OrganizationAuditLog.log(
          organization: current_organization,
          actor: current_user,
          action: "connector.sync",
          resource: @connector,
          tracked_changes: { connector_type: @connector.connector_type },
          request: request
        )
        render_resource(@connector, OrganizationConnectorSerializer)
      end

      # GET /api/v1/organizations/:organization_id/connectors/:id/sync_status
      def sync_status
        authorize! @connector, to: :sync_status?

        render json: {
          connector_type: @connector.connector_type,
          status:         @connector.status,
          last_sync_at:   @connector.last_sync_at&.iso8601,
          last_error:     @connector.last_error,
          total_events:   @connector.synced_event_count,
          repository_count: @connector.repositories.count,
          last_event_at:  @connector.synced_event_last_occurred_at&.iso8601
        }
      end

      # GET /api/v1/organizations/:organization_id/connectors/health
      def health
        authorize! current_organization.organization_connectors.new, to: :health?

        all_connectors    = current_organization.organization_connectors
        active_connectors = all_connectors.active.order(:connector_type).to_a
        status_counts     = all_connectors.group(:status).count
        snapshot_stats    = ConnectorHealthSnapshot.stats_for_org(current_organization.id, since: 7.days.ago)

        summary = {
          total:        status_counts.values.sum,
          connected:    status_counts.fetch("connected", 0),
          testing:      status_counts.fetch("testing", 0),
          error:        status_counts.fetch("error", 0),
          disconnected: status_counts.fetch("disconnected", 0)
        }

        connectors_data = active_connectors.map do |c|
          st    = snapshot_stats[c.id] || {}
          total = st[:success_count].to_i + st[:failure_count].to_i
          {
            id:                      c.id,
            connector_type:          c.connector_type,
            status:                  c.status,
            last_sync_at:            c.last_sync_at&.iso8601,
            last_error:              c.last_error,
            success_rate_7d:         total > 0 ? (st[:success_count].to_f / total).round(4) : nil,
            avg_sync_duration_ms_7d: st[:avg_duration_ms]&.round(1)
          }
        end

        render json: { data: { summary:, connectors: connectors_data } }
      end

      # GET /api/v1/organizations/:organization_id/connectors/authorize/:type
      def authorize_url
        authorize! current_organization.organization_connectors.new(connector_type: params[:type]), to: :authorize?

        provider_class = Oauth::BaseProvider.provider_class(params[:type])
        auth_url = provider_class.authorization_url(
          organization_id: current_organization.id,
          redirect_uri: oauth_callback_url
        )

        render json: { data: { authorize_url: auth_url } }
      rescue Oauth::MissingCredentialsError => e
        render json: { error: e.message, code: "integration_not_configured" }, status: :service_unavailable
      end

      # POST /api/v1/organizations/:organization_id/connectors/callback
      def callback
        connector_type = params[:connector_type]
        code = params[:code]

        authorize! current_organization.organization_connectors.new(connector_type: connector_type), to: :callback?

        provider_class = Oauth::BaseProvider.provider_class(connector_type)
        token_data = provider_class.exchange_code(code, redirect_uri: oauth_callback_url)

        external_org_id = token_data[:account_id]
        multi_instance = OrganizationConnector::MULTI_INSTANCE_CONNECTOR_TYPES.include?(connector_type)
        if multi_instance && external_org_id.blank?
          return render json: {
            error: "Unprocessable Entity",
            errors: { external_org_id: [ "is required for this connector type" ] }
          }, status: :unprocessable_content
        end

        connector = if multi_instance
          current_organization.organization_connectors
                              .find_or_initialize_by(connector_type: connector_type, external_org_id: external_org_id)
        else
          current_organization.organization_connectors
                              .find_or_initialize_by(connector_type: connector_type)
        end
        creating = connector.new_record?
        connector.assign_attributes(
          access_token: token_data[:access_token],
          refresh_token: token_data[:refresh_token],
          token_expires_at: token_data[:expires_at],
          external_org_id: external_org_id,
          external_org_name: token_data[:account_name],
          is_active: true,
          status: "connected",
          last_error: nil
        )
        connector.label = params[:label] if params[:label].present?

        if connector.save
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: creating ? "connector.create" : "connector.update",
            resource: connector,
            tracked_changes: { connector_type: connector.connector_type, via: "oauth_callback" },
            request: request
          )
          render_resource(connector, OrganizationConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(connector.errors)
          }, status: :unprocessable_content
        end
      rescue ActiveRecord::RecordNotUnique
        # Two simultaneous OAuth callbacks for the same org + external_org_id raced on
        # idx_org_connectors_oauth_dedup. The other request already inserted the row —
        # return it as if this callback succeeded (idempotent reconnect).
        connector = current_organization.organization_connectors
                                        .find_by!(connector_type: connector_type, external_org_id: external_org_id)
        render_resource(connector, OrganizationConnectorSerializer)
      rescue Oauth::MissingCredentialsError => e
        render json: { error: e.message, code: "integration_not_configured" }, status: :service_unavailable
      end

      private

      def set_connector
        @connector = current_organization.organization_connectors.find(params[:id])
      end

      def connector_params
        params.permit(:connector_type, :access_token, :refresh_token, :token_expires_at,
                      :external_account_id, :external_account_name, :webhook_secret, :is_active, :label)
      end

      def connector_update_params
        params.permit(:access_token, :refresh_token, :token_expires_at,
                      :external_account_id, :external_account_name, :webhook_secret, :is_active, :label,
                      config: [ :sync_repositories, :sync_pull_requests, :webhook_enabled, :linked_project_id ])
      end

      def merge_connector_config(incoming_config)
        existing = (@connector.config || {}).stringify_keys
        to_set = incoming_config.reject { |_, v| v.nil? }
        to_delete = incoming_config.select { |_, v| v.nil? }.keys
        existing.merge(to_set).except(*to_delete)
      end

      def oauth_callback_url
        # Redirect to frontend callback page which handles the OAuth popup flow
        frontend_url = ENV.fetch("FRONTEND_URL", "http://localhost:5173")
        "#{frontend_url}/integrations/callback"
      end
    end
  end
end
