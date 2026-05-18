# frozen_string_literal: true

module Api
  module V1
    module Integrations
      # Exchanges an authenticated user's Keycloak access token (Bearer) for a
      # fresh `UserToolAccount` ingest token. The MCP client calls this after
      # RFC 8628 device authorization completes.
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

          permitted = params.permit(:tool_name, :device_label)
          tool_name, _device_label = permitted.values_at(:tool_name, :device_label)
          tool_name = tool_name.to_s
          unless UserToolAccount::INGEST_TOOLS.include?(tool_name)
            return render json: {
              error: "Unprocessable Entity",
              errors: {
                tool_name: [ "must be one of: #{UserToolAccount::INGEST_TOOLS.join(', ')}" ]
              }
            }, status: :unprocessable_content
          end

          tool_account = nil
          validation_errors = nil

          membership.with_lock do
            tool_account = membership.user_tool_accounts.find_or_initialize_by(tool_name: tool_name)
            tool_account.is_active = true

            if tool_account.new_record? && !tool_account.save
              validation_errors = tool_account.errors
              next
            end

            tool_account.rotate_ingest_token!
          end

          if validation_errors
            return render json: {
              error: "Unprocessable Entity",
              errors: format_validation_errors(validation_errors)
            }, status: :unprocessable_content
          end

          render json: {
            data: {
              ingestToken: tool_account.plaintext_token,
              ingestHost: request.base_url,
              organizationId: membership.organization_id.to_s
            }
          }, status: :created
        end

        private

        # Picks the oldest membership for stable resolution. Client-org header
        # selection is deferred.
        def primary_membership
          current_user.organization_memberships.order(:created_at).first
        end
      end
    end
  end
end
