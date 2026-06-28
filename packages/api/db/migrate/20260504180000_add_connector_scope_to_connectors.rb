# frozen_string_literal: true

class AddConnectorScopeToConnectors < ActiveRecord::Migration[8.1]
  # Scope mapping derived from connector type. Fixed by provider — not user-configurable.
  # org:     anthropic, openai, openrouter, gemini, slack, jira, linear, github_copilot
  # project: github, gitlab, bitbucket
  # persona: claude_code, cursor (user_tool_accounts only)
  PROJECT_SCOPED_TYPES = %w[github gitlab bitbucket].freeze

  def up
    add_column :organization_connectors, :connector_scope, :string, null: false, default: "org"
    add_column :project_connectors, :connector_scope, :string, null: false, default: "project"
    add_column :user_tool_accounts, :connector_scope, :string, null: false, default: "persona"

    # Backfill project-scoped connectors. All others stay at the default 'org'.
    execute <<~SQL
      UPDATE organization_connectors
      SET connector_scope = 'project'
      WHERE connector_type IN ('github', 'gitlab', 'bitbucket')
    SQL
  end

  def down
    remove_column :organization_connectors, :connector_scope
    remove_column :project_connectors, :connector_scope
    remove_column :user_tool_accounts, :connector_scope
  end
end
