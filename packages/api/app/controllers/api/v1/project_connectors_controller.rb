# frozen_string_literal: true

module Api
  module V1
    class ProjectConnectorsController < BaseController
      before_action :set_project
      before_action :set_connector, only: %i[show update destroy test sync]

      # GET /api/v1/projects/:project_id/connectors
      def index
        authorize! @project, to: :show?, with: ProjectPolicy
        connectors = @project.project_connectors.order(:connector_type)
        connectors = connectors.by_type(params[:type]) if params[:type].present?
        connectors = connectors.active if params[:active] == "true"
        render_collection(connectors, ProjectConnectorSerializer)
      end

      # GET /api/v1/projects/:project_id/connectors/:id
      def show
        authorize! @connector
        render_resource(@connector, ProjectConnectorSerializer)
      end

      # POST /api/v1/projects/:project_id/connectors
      def create
        # Support retrying a failed connector of the same type
        @connector = @project.project_connectors.find_or_initialize_by(
          connector_type: params[:connector_type]
        )

        # Reject if an active connector of this type already exists
        if @connector.persisted? && @connector.is_active?
          return render json: {
            error: "Unprocessable Entity",
            errors: { connector_type: [ "already exists for this project" ] }
          }, status: :unprocessable_entity
        end

        @connector.assign_attributes(connector_params)
        authorize! @connector

        # Validate API key / webhook URL for AI providers and Slack webhooks
        provider = Oauth::BaseProvider.for(@connector) if @connector.ai_provider? || @connector.slack_webhook?
        result = provider&.test_connection || { success: true }

        unless result[:success]
          error_msg = result[:error] || "Invalid API key"
          @connector.assign_attributes(is_active: false, status: "error", last_error: error_msg)
          unless @connector.save
            Rails.logger.warn("[ProjectConnector] Failed to persist error state for " \
                              "#{@connector.connector_type}: #{@connector.errors.full_messages}")
          end
          return render json: {
            error: "Unprocessable Entity",
            errors: { access_token: [ error_msg ] }
          }, status: :unprocessable_entity
        end

        @connector.assign_attributes(is_active: true, status: "connected", last_error: nil, last_sync_at: Time.current)
        if @connector.save
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "connector.create",
            resource: @connector,
            tracked_changes: { connector_type: @connector.connector_type },
            request: request
          )
          render_created(@connector, ProjectConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@connector.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/projects/:project_id/connectors/:id
      def update
        authorize! @connector

        # Track only non-sensitive fields; token fields are intentionally excluded from audit logs.
        changes_before = @connector.slice(:is_active, :status, :external_org_name)

        if @connector.update(connector_update_params)
          changes_after = @connector.slice(:is_active, :status, :external_org_name)
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "connector.update",
            resource: @connector,
            tracked_changes: { before: changes_before, after: changes_after },
            request: request
          )
          render_resource(@connector, ProjectConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@connector.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/projects/:project_id/connectors/:id
      def destroy
        authorize! @connector

        connector_type = @connector.connector_type
        @connector.destroy!

        ProjectAuditLog.log(
          project: @project,
          actor: current_user,
          action: "connector.delete",
          resource: @connector,
          tracked_changes: { connector_type: connector_type },
          request: request
        )

        render_no_content
      end

      # POST /api/v1/projects/:project_id/connectors/:id/test
      # Supports all connector types via Oauth::BaseProvider.for dispatch,
      # including AI providers (Anthropic, OpenAI, etc.) and Slack webhooks.
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
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "connector.test",
            resource: @connector,
            tracked_changes: { connector_type: @connector.connector_type, success: true },
            request: request
          )
          render json: { data: { success: true, message: "Connection successful" } }
        else
          @connector.mark_error!(result[:error])
          ProjectAuditLog.log(
            project: @project,
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
        ProjectAuditLog.log(
          project: @project,
          actor: current_user,
          action: "connector.test",
          resource: @connector,
          tracked_changes: { connector_type: @connector.connector_type, success: false, error: e.message },
          request: request
        )
        render json: { data: { success: false, error: e.message } }, status: :ok
      end

      # POST /api/v1/projects/:project_id/connectors/:id/sync
      def sync
        authorize! @connector, to: :sync?
        @connector.mark_synced!
        ProjectAuditLog.log(
          project: @project,
          actor: current_user,
          action: "connector.sync",
          resource: @connector,
          tracked_changes: { connector_type: @connector.connector_type },
          request: request
        )
        render_resource(@connector, ProjectConnectorSerializer)
      end

      private

      def set_project
        @project = Project.find(params[:project_id])
      end

      def set_connector
        @connector = @project.project_connectors.find(params[:id])
      end

      def connector_params
        params.permit(:connector_type, :access_token, :refresh_token, :token_expires_at,
                      :external_org_id, :external_org_name, :is_active)
      end

      def connector_update_params
        params.permit(:access_token, :refresh_token, :token_expires_at,
                      :external_org_id, :external_org_name, :is_active)
      end
    end
  end
end
