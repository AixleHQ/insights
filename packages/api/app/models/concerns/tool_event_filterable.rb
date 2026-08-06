# frozen_string_literal: true

# Shared filter logic for ToolEvent queries.
# Used by Api::V1::EventsController (request params) and ToolEventExportJob (hash params).
module ToolEventFilterable
  # Apply all standard filters from a hash of params (string or symbol keys).
  def apply_tool_event_filters(scope, fp)
    fp = fp.transform_keys(&:to_s)

    scope = apply_tool_event_time_filter(scope, fp)
    if (tools = normalize_string_array(fp["tool_name"])).any?
      scope = scope.where(tool_name: tools)
    end
    if (raw_search = fp["search"].to_s.strip).present?
      # Substring search over tool_name + project name. Rather than an unindexed
      # leading-wildcard ILIKE on the enum cast (and a per-row LEFT JOIN projects)
      # across the tool_events history, resolve matches to indexed IN predicates:
      #   - tool_name is a fixed enum, so match its known values in Ruby.
      #   - project names resolve via a subquery on the small projects table,
      #     feeding project_id IN (...) — hits idx_tool_events_project_occurred.
      matching_tools = ToolEvent::TOOL_NAMES.select { |name| name.include?(raw_search.downcase) }
      like_term = "%#{ActiveRecord::Base.sanitize_sql_like(raw_search)}%"
      project_ids = Project.where("name ILIKE ?", like_term).select(:id)
      scope = scope.where(tool_name: matching_tools).or(scope.where(project_id: project_ids))
    end
    if (types = normalize_string_array(fp["event_type"])).any?
      scope = scope.where(event_type: types)
    end
    scope = scope.where(user_id: fp["user_id"])       if fp["user_id"].present?
    if normalize_project_filter(fp["project_id"]) == "none"
      scope = scope.where(project_id: nil)
    elsif (project_ids = normalize_string_array(fp["project_id"])).any?
      scope = scope.where(project_id: project_ids)
    end
    scope = scope.where(model: fp["model"])            if fp["model"].present?
    scope = apply_tool_event_risk_level_filter(scope, fp["risk_level"])
    scope
  end

  def apply_tool_event_time_filter(scope, fp)
    fp = fp.transform_keys(&:to_s)
    zone = ActiveSupport::TimeZone[fp["tz"].to_s] || Time.zone
    if fp["start_date"].present?
      parsed = begin; zone.parse(fp["start_date"]); rescue ArgumentError; nil; end
      scope = scope.where("occurred_at >= ?", parsed.beginning_of_day) if parsed
    end
    if fp["end_date"].present?
      # Inclusive calendar end date (UI sends YYYY-MM-DD from <input type="date">).
      parsed = begin; zone.parse(fp["end_date"]); rescue ArgumentError; nil; end
      scope = scope.where("occurred_at <= ?", parsed.end_of_day) if parsed
    end
    scope
  end

  # Same audit_logs-first, metadata-fallback precedence as ToolEvent#canonical_risk_level,
  # expressed as SQL so filtering can never disagree with what the UI displays. A tool_event
  # can accumulate multiple audit_logs over time (re-scans), so this must key off the single
  # latest one by created_at rather than an EXISTS check across all of an event's history --
  # otherwise an event whose latest scan is "critical" could still match a "medium" filter
  # because some earlier scan happened to be "medium" (AIX-464).
  CANONICAL_RISK_LEVEL_SQL = <<~SQL.freeze
    COALESCE(
      (
        SELECT audit_logs.risk_level::text FROM audit_logs
        WHERE audit_logs.tool_event_id = tool_events.id
        ORDER BY audit_logs.created_at DESC
        LIMIT 1
      ),
      tool_events.metadata->>'risk_level',
      'none'
    )
  SQL

  def apply_tool_event_risk_level_filter(scope, risk_level)
    return scope if risk_level.blank?

    levels = normalize_string_array(risk_level)
    return scope if levels.empty?

    if levels.include?("not_none")
      return scope.where("(#{CANONICAL_RISK_LEVEL_SQL}) NOT IN ('none')")
    end

    scope.where("(#{CANONICAL_RISK_LEVEL_SQL}) IN (?)", levels)
  end

  private

  # Mirrors StatsController#scoped_events_base's normalization so array-form values
  # (e.g. project_id[]=none) and stray whitespace match the "none" sentinel the same
  # way on both endpoints.
  def normalize_project_filter(value)
    Array.wrap(value).first.to_s.strip.presence
  end

  def normalize_string_array(value)
    case value
    when Array then value.flatten.compact.map(&:to_s).reject(&:blank?)
    when String then value.split(",").map(&:strip).reject(&:empty?)
    else []
    end
  end

  # Keep normalize_event_types as an alias for compatibility with ToolEventExportJob
  def normalize_event_types(value)
    normalize_string_array(value)
  end
end
