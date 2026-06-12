# frozen_string_literal: true

class OrganizationProviderSetting < ApplicationRecord
  # "claude-code" is intentionally absent — it is a CLI tool-event attribution type
  # in the TypeScript IntegrationProvider union, not a catalog integration. There is
  # no manage-catalog UI surface for it, and adding it here would silently accept a
  # PATCH that has no effect on the project connector tab.
  KNOWN_PROVIDERS = %w[
    github gitlab bitbucket jira linear
    openrouter anthropic openai gemini slack github_copilot
    claude figma cursor google
  ].freeze

  belongs_to :organization

  validates :provider, presence: true,
                       inclusion: { in: KNOWN_PROVIDERS },
                       uniqueness: { scope: :organization_id }
  validates :enabled, inclusion: { in: [ true, false ] }
end
