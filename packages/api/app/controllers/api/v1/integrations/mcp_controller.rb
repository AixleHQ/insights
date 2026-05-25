# frozen_string_literal: true

module Api
  module V1
    module Integrations
      # Exchanges Keycloak Bearer tokens for ingest tokens on one or more
      # `UserToolAccount` rows. Membership is the user's oldest org by default, or the
      # org named by optional `X-Organization-ID` when the user belongs to it.
      class McpController < BaseController
        # Exchange resolves org membership itself (optional header + primary fallback).
        # Skip global org header enforcement so invalid org ids reach this action and
        # return the MCP-specific forbidden payload without invoking the exchange service.
        skip_before_action :set_current_organization, only: :exchange

        # POST /api/v1/integrations/mcp/exchange
        def exchange
          membership = resolve_exchange_membership
          return if performed?

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

        UUID_FORMAT = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i

        def exchange_params
          params.permit(:tool_name, :device_label, tools: [])
        end

        def resolve_exchange_membership
          raw_org_id = request.headers["X-Organization-ID"]

          return primary_membership if raw_org_id.nil?

          org_id = raw_org_id.to_s.strip
          return render_exchange_forbidden unless org_id.match?(UUID_FORMAT)

          membership = current_user.organization_memberships.find_by(organization_id: org_id)
          return render_exchange_forbidden unless membership

          membership
        end

        def primary_membership
          current_user.organization_memberships.order(:created_at).first
        end

        def render_exchange_forbidden
          render json: {
            error: "Forbidden",
            message: "No organization membership found for the specified organization"
          }, status: :forbidden
          nil
        end
      end
    end
  end
end
