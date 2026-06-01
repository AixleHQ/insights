# frozen_string_literal: true

# Batches COUNT / SUM(cost_usd) / MAX(occurred_at) for tool_events grouped by project_id.
#
# Defense-in-depth: callers must pass an authorization context (either an
# `organization_id`, a `user_id`, or both). Even though callers are expected to
# authorize project IDs first via `authorized_scope`, this constraint ensures a
# forgotten authorization can never leak cross-org aggregates through this builder.
#
# For an org project list, pass `organization_id:` (events match by org).
# For a personal project list, pass `user_id:` (events match by owner).
# For a mixed list, pass both — they're combined as `(org_id = ?) OR (user_id = ?)`.
class ProjectToolEventAggregates
  Stat = Data.define(:event_count, :total_cost_usd, :last_event_at)

  class << self
    # @param ids [Array<String>] project UUIDs
    # @param organization_id [String, nil] org scope for events on org projects
    # @param user_id [String, nil] user scope for events on personal projects
    # @return [Hash<String, Stat>] stats per project_id (projects with no events are omitted)
    def for_project_ids(ids, organization_id: nil, user_id: nil)
      ids = ids.compact.uniq
      return {} if ids.empty?
      if organization_id.blank? && user_id.blank?
        raise ArgumentError, "must supply organization_id and/or user_id for defense-in-depth scoping"
      end

      scope = ToolEvent.where(project_id: ids)
      scope = apply_principal_scope(scope, organization_id: organization_id, user_id: user_id)

      scope
        .group(:project_id)
        .pluck(
          :project_id,
          Arel.sql("COUNT(*)"),
          Arel.sql("COALESCE(SUM(cost_usd), 0)"),
          Arel.sql("MAX(occurred_at)")
        )
        .to_h do |project_id, count, cost_sum, last_at|
          [
            project_id,
            Stat.new(
              event_count: count.to_i,
              total_cost_usd: cost_sum.to_f,
              last_event_at: last_at
            )
          ]
        end
    end

    private

    def apply_principal_scope(scope, organization_id:, user_id:)
      if organization_id.present? && user_id.present?
        scope.where("organization_id = ? OR user_id = ?", organization_id, user_id)
      elsif organization_id.present?
        scope.where(organization_id: organization_id)
      else
        scope.where(user_id: user_id)
      end
    end
  end
end
