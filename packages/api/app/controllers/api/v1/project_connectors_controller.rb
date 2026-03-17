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
        @connector = @project.project_connectors.new(connector_params)
        authorize! @connector

        provider = Oauth::BaseProvider.for(@connector)
        result = provider.test_connection
        unless result[:success]
          return render json: {
            error: "Unprocessable Entity",
            errors: { access_token: [ result[:error] || "Invalid API key" ] }
          }, status: :unprocessable_entity
        end

        if @connector.save
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

        if @connector.update(connector_update_params)
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
        @connector.destroy!
        render_no_content
      end

      # POST /api/v1/projects/:project_id/connectors/:id/test
      def test
        authorize! @connector, to: :test?

        provider = Oauth::BaseProvider.for(@connector)
        result = provider.test_connection

        if result[:success]
          @connector.mark_connected!
          render json: { data: { success: true, message: "Connection successful" } }
        else
          @connector.mark_error!(result[:error])
          render json: { data: { success: false, error: result[:error] } }, status: :ok
        end
      rescue ActionPolicy::Unauthorized
        raise
      rescue StandardError => e
        @connector.mark_error!(e.message)
        render json: { data: { success: false, error: e.message } }, status: :ok
      end

      # POST /api/v1/projects/:project_id/connectors/:id/sync
      def sync
        authorize! @connector, to: :sync?
        @connector.mark_synced!
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
                      :external_account_id, :external_account_name, :is_active)
      end

      def connector_update_params
        params.permit(:access_token, :refresh_token, :token_expires_at,
                      :external_account_id, :external_account_name, :is_active)
      end
    end
  end
end
