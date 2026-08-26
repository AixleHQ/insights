# frozen_string_literal: true

module Api
  module V1
    module Integrations
      # Exchanges Keycloak Bearer tokens for ingest tokens on one or more
      # `UserToolAccount` rows. Membership resolution when `X-Organization-ID` is absent:
      #   0 memberships  -> 403 (no membership)
      #   1 membership   -> that membership (silent, zero-friction)
      #   >1 membership  -> the user's `default_org_id` preference if still a member,
      #                     else 422 `organization_selection_required` with the org list.
      # An explicit `X-Organization-ID` always wins; blank/malformed -> 403.
      class McpController < BaseController
        # Exchange resolves org membership itself (optional header; otherwise default-org resolution).
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

          return resolve_default_membership if raw_org_id.nil?

          org_id = raw_org_id.to_s.strip
          return render_exchange_forbidden unless org_id.match?(UUID_FORMAT)

          membership = current_user.organization_memberships.find_by(organization_id: org_id)
          return render_exchange_forbidden unless membership

          membership
        end

        def resolve_default_membership
          memberships = current_user.organization_memberships
          count = memberships.count
          return memberships.first if count <= 1 # 0 -> nil -> caller renders 403; 1 -> bind it

          default_org_id = ::UserSetting.get(current_user, "default_org_id")
          if default_org_id.present?
            default = memberships.find_by(organization_id: default_org_id)
            return default if default
          end

          render_organization_selection_required(memberships)
          nil
        end

        def render_organization_selection_required(memberships)
          orgs = memberships.includes(:organization).map do |m|
            { id: m.organization_id.to_s, name: m.organization.name, role: m.role }
          end.sort_by { |o| o[:name] }

          render json: {
            error: "organization_selection_required",
            message: "You belong to #{orgs.size} organizations. Re-run init with " \
                     "--organization-id <uuid>, or set a Default Organization in web Preferences.",
            organizations: orgs
          }, status: :unprocessable_content
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
