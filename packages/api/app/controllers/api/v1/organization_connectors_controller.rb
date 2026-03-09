# frozen_string_literal: true

module Api
  module V1
    class OrganizationConnectorsController < BaseController
      before_action :require_organization!
      before_action :set_connector, only: %i[show update destroy test sync]

      # GET /api/v1/organizations/:organization_id/connectors
      def index
        connectors = current_organization.organization_connectors.order(:connector_type)

        # Allow filtering by type
        connectors = connectors.by_type(params[:type]) if params[:type].present?
        connectors = connectors.active if params[:active] == "true"

        render_collection(connectors, OrganizationConnectorSerializer)
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

        if @connector.ai_provider? || @connector.slack_webhook?
          provider = Oauth::BaseProvider.for(@connector)
          result = provider.test_connection
          unless result[:success]
            return render json: {
              error: "Unprocessable Entity",
              errors: { access_token: [ result[:error] || "Invalid API key" ] }
            }, status: :unprocessable_entity
          end
        end

        if @connector.save
          render_created(@connector, OrganizationConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@connector.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/organizations/:organization_id/connectors/:id
      def update
        authorize! @connector

        if @connector.update(connector_update_params)
          render_resource(@connector, OrganizationConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@connector.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:organization_id/connectors/:id
      def destroy
        authorize! @connector
        @connector.destroy!
        render_no_content
      end

      # POST /api/v1/organizations/:organization_id/connectors/:id/test
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
      rescue StandardError => e
        @connector.mark_error!(e.message)
        render json: { data: { success: false, error: e.message } }, status: :ok
      end

      # POST /api/v1/organizations/:organization_id/connectors/:id/sync
      def sync
        authorize! @connector, to: :sync?

        # Queue sync job
        # ConnectorSyncJob.perform_later(@connector.id)

        @connector.mark_synced!
        render_resource(@connector, OrganizationConnectorSerializer)
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
      end

      # POST /api/v1/organizations/:organization_id/connectors/callback
      def callback
        connector_type = params[:connector_type]
        code = params[:code]

        authorize! current_organization.organization_connectors.new(connector_type: connector_type), to: :callback?

        provider_class = Oauth::BaseProvider.provider_class(connector_type)
        token_data = provider_class.exchange_code(code, redirect_uri: oauth_callback_url)

        connector = current_organization.organization_connectors
                                        .find_or_initialize_by(connector_type: connector_type)
        connector.assign_attributes(
          access_token: token_data[:access_token],
          refresh_token: token_data[:refresh_token],
          token_expires_at: token_data[:expires_at],
          external_account_id: token_data[:account_id],
          external_account_name: token_data[:account_name],
          is_active: true,
          status: "connected",
          last_error: nil
        )

        if connector.save
          render_resource(connector, OrganizationConnectorSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(connector.errors)
          }, status: :unprocessable_entity
        end
      end

      private

      def set_connector
        @connector = current_organization.organization_connectors.find(params[:id])
      end

      def connector_params
        params.permit(:connector_type, :access_token, :refresh_token, :token_expires_at,
                      :external_account_id, :external_account_name, :webhook_secret, :is_active)
      end

      def connector_update_params
        params.permit(:access_token, :refresh_token, :token_expires_at,
                      :external_account_id, :external_account_name, :webhook_secret, :is_active)
      end

      def oauth_callback_url
        # Redirect to frontend callback page which handles the OAuth popup flow
        frontend_url = ENV.fetch("FRONTEND_URL", "http://localhost:5173")
        "#{frontend_url}/integrations/callback"
      end
    end
  end
end
