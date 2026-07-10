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

  SUMMARY_PARAM_KEYS = %w[
    tool_name event_type user_id project_id model start_date end_date risk_level
  ].freeze

  # Builds rows for the CSV preamble: title "Applied filters", then one row per active filter.
  # @param filter_params [Hash] string/symbol keys from permitted export params
  # @param organization [Organization, nil] used to resolve project name
  # @return [Array<String>, nil] nil when no filter keys are present
  def self.filter_summary_lines_for_export(filter_params, organization: nil)
    fp = filter_params.transform_keys(&:to_s).slice(*SUMMARY_PARAM_KEYS)
    lines = []

    lines << "Tool: #{fp['tool_name']}"                       if fp["tool_name"].present?
    lines << "Event type: #{fp['event_type']}"                if fp["event_type"].present?
    lines << "Model: #{fp['model']}"                          if fp["model"].present?
    lines << "From: #{fp['start_date']}"                      if fp["start_date"].present?
    lines << "To: #{fp['end_date']}"                          if fp["end_date"].present?
    lines << "Risk level: #{fp['risk_level']}"                if fp["risk_level"].present?

    if fp["user_id"].present?
      email = User.find_by(id: fp["user_id"])&.email
      lines << "User: #{email || fp['user_id']}"
    end

    if fp["project_id"].present?
      project_label =
        if organization
          organization.projects.find_by(id: fp["project_id"])&.name || fp["project_id"]
        else
          fp["project_id"]
        end
      lines << "Project: #{project_label}"
    end

    return nil if lines.empty?

    [ "Applied filters", *lines ]
  end

  # @param filter_summary_lines [Array<String>, nil] optional preamble before column headers (see {#filter_summary_lines_for_export})
  def self.generate(events, role, filter_summary_lines: nil)
    headers =
      case role
      when :global_admin then GLOBAL_ADMIN_HEADERS
      when :org_admin    then ORG_ADMIN_HEADERS
      else                    MEMBER_HEADERS
      end

    require "csv"
    CSV.generate(headers: true) do |csv|
      if filter_summary_lines.present?
        filter_summary_lines.each { |line| csv << [ line ] }
        csv << []
      end
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
        row << csv_safe(event.model)               if role == :global_admin
        row << event.metadata&.dig("session_id")  if role == :global_admin
        csv << row
      end
    end
  end

  def self.risk_level_for(event)
    event.canonical_risk_level
  end

  # Neutralises CSV formula-injection for values that may contain arbitrary
  # strings (e.g. model column) from legacy/pre-normalisation rows.
  # Prefixes cells starting with a formula trigger (= + @ or a leading tab)
  # with a single quote so spreadsheet applications treat them as literals.
  # NOTE: "-" is intentionally NOT guarded — it is not a formula trigger in
  # Excel/Sheets and prefixing it would corrupt legitimate names like
  # "-preview-model" for any consumer that re-imports the export.
  def self.csv_safe(value)
    return value if value.nil?

    str = value.to_s
    str.start_with?("=", "+", "@", "\t") ? "'#{str}" : str
  end
end
