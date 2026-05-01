# frozen_string_literal: true

module Integrations
  # Authorizes access to the MCP exchange endpoint. Internal-only by design:
  # only @example.com accounts may exchange OIDC tokens for ingest
  # tokens through this surface (per Slack 2026-04-27 12:38).
  class McpPolicy < ApplicationPolicy
    def exchange?
      return false unless user

      internal_email? && user.organization_memberships.any?
    end

    private

    def internal_email?
      user.email.to_s.downcase.end_with?("@example.com")
    end
  end
end
