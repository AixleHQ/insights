# frozen_string_literal: true

# Shared filter logic for ToolEvent queries.
# Used by Api::V1::EventsController (request params) and ToolEventExportJob (hash params).
module ToolEventFilterable
  # Apply all standard filters from a hash of params (string or symbol keys).
  def apply_tool_event_filters(scope, fp)
    fp = fp.transform_keys(&:to_s)

    scope = apply_tool_event_time_filter(scope, fp)
    scope = scope.where(tool_name: fp["tool_name"])   if fp["tool_name"].present?
    if (types = normalize_event_types(fp["event_type"])).any?
      scope = scope.where(event_type: types)
    end
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

  def apply_tool_event_risk_level_filter(scope, risk_level)
    return scope if risk_level.blank?

    case risk_level
    when "not_none"
      scope.where("metadata->>'risk_level' IS NOT NULL AND metadata->>'risk_level' NOT IN ('none', '')")
    when "none"
      scope.where("metadata->>'risk_level' IS NULL OR metadata->>'risk_level' IN ('none', '')")
    else
      scope.where("metadata->>'risk_level' = ?", risk_level)
    end
  end

  private

  def normalize_event_types(value)
    case value
    when Array then value.flatten.compact.reject(&:blank?)
    when String then value.split(",").map(&:strip).reject(&:empty?)
    else []
    end
  end
end
