# frozen_string_literal: true

module Api
  module V1
    module Integrations
      # Exchanges an authenticated user's OIDC session for a fresh
      # UserToolAccount ingest token, scoped to the requested tool. The MCP
      # client (packages/tools/db90-mcp) calls this once after a successful
      # Keycloak device-flow login to obtain the ingest credential it stores
      # in the OS keychain.
      class McpController < BaseController
        SUPPORTED_TOOLS = %w[claude_code cursor].freeze

        # POST /api/v1/integrations/mcp/exchange
        def exchange
          authorize! :mcp_exchange, to: :exchange?, with: ::Integrations::McpPolicy

          tool_name = params[:tool_name].to_s
          unless SUPPORTED_TOOLS.include?(tool_name)
            return render json: {
              error: "Unprocessable Entity",
              errors: { tool_name: [ "must be one of: #{SUPPORTED_TOOLS.join(', ')}" ] }
            }, status: :unprocessable_entity
          end

          membership = primary_membership
          if membership.nil?
            return render json: {
              error: "Unprocessable Entity",
              errors: { user: [ "has no organization membership" ] }
            }, status: :unprocessable_entity
          end

          tool_account = membership.user_tool_accounts.new(tool_name: tool_name, is_active: true)

          if tool_account.save
            render json: {
              ingest_token: tool_account.plaintext_token,
              host: ingest_host,
              tool_name: tool_name
            }, status: :created
          else
            render json: {
              error: "Unprocessable Entity",
              errors: format_validation_errors(tool_account.errors)
            }, status: :unprocessable_entity
          end
        end

        private

        # Resolves the user's organization. Internal users typically belong to a
        # single Dualboot org; pick the oldest membership for stability across
        # repeat exchanges. When client-org support lands (deferred — Slack
        # 2026-04-27), this resolution will need an X-Organization-ID header.
        def primary_membership
          current_user.organization_memberships.order(:created_at).first
        end

        def ingest_host
          ENV.fetch("DB90_PUBLIC_HOST", request.base_url)
        end
      end
    end
  end
end
