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
    if (types = normalize_string_array(fp["event_type"])).any?
      scope = scope.where(event_type: types)
    end
    scope = scope.where(user_id: fp["user_id"])       if fp["user_id"].present?
    if (project_ids = normalize_string_array(fp["project_id"])).any?
      scope = scope.where(project_id: project_ids)
    end
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

    levels = normalize_string_array(risk_level)
    return scope if levels.empty?

    # Special sentinel values cannot be mixed with explicit levels.
    if levels.include?("not_none")
      return scope.where("metadata->>'risk_level' IS NOT NULL AND metadata->>'risk_level' NOT IN ('none', '')")
    end

    none_selected = levels.include?("none")
    explicit = levels.reject { |l| l == "none" }

    if none_selected && explicit.any?
      scope.where(
        "metadata->>'risk_level' IS NULL OR metadata->>'risk_level' IN (?)",
        explicit + [ "none", "" ]
      )
    elsif none_selected
      scope.where("metadata->>'risk_level' IS NULL OR metadata->>'risk_level' IN ('none', '')")
    else
      scope.where("metadata->>'risk_level' IN (?)", explicit)
    end
  end

  private

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
