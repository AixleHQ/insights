# frozen_string_literal: true

# Metadata for the authenticated user's ingest tool accounts in the current org.
# Never includes token material — only fields needed by Settings.
class MeToolAccountMetadataSerializer < BaseSerializer
  attributes :id, :tool_name, :connection_state
  timestamps

  attribute :last_used_at do |account|
    t = params[:last_used_by_tool]&.[](account.tool_name)
    t&.iso8601
  end

  attribute :display_name do |account|
    case account.tool_name
    when "claude_code" then "Claude Code"
    when "cursor" then "Cursor"
    else account.tool_name.to_s.tr("_", " ").split.map(&:capitalize).join(" ")
    end
  end
end
