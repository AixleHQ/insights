# frozen_string_literal: true

module Api
  module V1
    module Integrations
      # Exchanges Keycloak Bearer tokens for ingest tokens on one or more
      # `UserToolAccount` rows (scoped to the user's oldest org membership).
      class McpController < BaseController
        # POST /api/v1/integrations/mcp/exchange
        def exchange
          membership = primary_membership
          if membership.blank?
            return render json: {
              error: "Forbidden",
              message: "No organization membership found for this user"
            }, status: :forbidden
          end

          authorize! membership, to: :create?, with: ::UserToolAccountPolicy

          result = ::Mcp::IngestTokenExchangeService.call(
            membership: membership,
            tool_name: exchange_params[:tool_name],
            tools: exchange_params[:tools],
            ingest_host: request.base_url
          )

          render json: result.body, status: result.http_status
        end

        private

        def exchange_params
          params.permit(:tool_name, :device_label, tools: [])
        end

        def primary_membership
          current_user.organization_memberships.order(:created_at).first
        end
      end
    end
  end
end
