# frozen_string_literal: true

# Shared filter logic for ToolEvent queries.
# Used by Api::V1::EventsController (request params) and ToolEventExportJob (hash params).
module ToolEventFilterable
  # Apply all standard filters from a hash of params (string or symbol keys).
  def apply_tool_event_filters(scope, fp)
    fp = fp.transform_keys(&:to_s)

    scope = apply_tool_event_time_filter(scope, fp)
    scope = scope.where(tool_name: fp["tool_name"])   if fp["tool_name"].present?
    scope = scope.where(event_type: fp["event_type"]) if fp["event_type"].present?
    scope = scope.where(user_id: fp["user_id"])       if fp["user_id"].present?
    scope = scope.where(project_id: fp["project_id"]) if fp["project_id"].present?
    scope = scope.where(model: fp["model"])            if fp["model"].present?
    scope = apply_tool_event_risk_level_filter(scope, fp["risk_level"])
    scope
  end

  def apply_tool_event_time_filter(scope, fp)
    fp = fp.transform_keys(&:to_s)
    if fp["start_date"].present?
      scope = scope.where("occurred_at >= ?", Time.zone.parse(fp["start_date"]).beginning_of_day)
    end
    if fp["end_date"].present?
      # Inclusive calendar end date (UI sends YYYY-MM-DD from <input type="date">).
      scope = scope.where("occurred_at <= ?", Time.zone.parse(fp["end_date"]).end_of_day)
    end
    scope
  end

  # Thresholds match ToolEventAttributes#risk_level. UI may send "critical"; bucket it with high (cost > $1).
  def apply_tool_event_risk_level_filter(scope, risk_level)
    case risk_level
    when "high", "critical" then scope.where("cost_usd > 1.0")
    when "medium" then scope.where("cost_usd > 0.1 AND cost_usd <= 1.0")
    when "low"    then scope.where("cost_usd > 0.01 AND cost_usd <= 0.1")
    when "none"   then scope.where("cost_usd IS NULL OR cost_usd <= 0.01")
    else scope
    end
  end
end
