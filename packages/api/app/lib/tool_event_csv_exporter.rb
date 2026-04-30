# frozen_string_literal: true

# Generates a role-scoped CSV from a ToolEvent relation.
# Pure Ruby module — no Rails controller dependency.
#
# Roles:
#   :member      — base columns only; no user data
#   :org_admin   — adds user_email
#   :global_admin — adds user_email, model, session_id (from metadata)
module ToolEventCsvExporter
  MEMBER_HEADERS = %w[
    occurred_at tool_name event_type risk_level
    project tokens_in tokens_out cost_usd
  ].freeze

  ORG_ADMIN_HEADERS    = (MEMBER_HEADERS + %w[user_email]).freeze
  GLOBAL_ADMIN_HEADERS = (ORG_ADMIN_HEADERS + %w[model session_id]).freeze

  def self.generate(events, role)
    headers =
      case role
      when :global_admin then GLOBAL_ADMIN_HEADERS
      when :org_admin    then ORG_ADMIN_HEADERS
      else                    MEMBER_HEADERS
      end

    require "csv"
    CSV.generate(headers: true) do |csv|
      csv << headers
      events.each do |event|
        row = [
          event.occurred_at&.iso8601,
          event.tool_name,
          event.event_type,
          risk_level_for(event),
          event.project&.name,
          event.tokens_in,
          event.tokens_out,
          event.cost_usd
        ]
        row << event.user&.email                  if role.in?(%i[org_admin global_admin])
        row << event.model                         if role == :global_admin
        row << event.metadata&.dig("session_id")  if role == :global_admin
        csv << row
      end
    end
  end

  # Mirrors ToolEventAttributes#risk_level thresholds exactly.
  def self.risk_level_for(event)
    cost = event.cost_usd.to_f
    if    cost > 1.0  then "high"
    elsif cost > 0.1  then "medium"
    elsif cost > 0.01 then "low"
    else "none"
    end
  end
end
