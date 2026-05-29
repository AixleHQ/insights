# frozen_string_literal: true

# Batches COUNT / SUM(cost_usd) / MAX(occurred_at) for tool_events grouped by project_id.
class ProjectToolEventAggregates
  Stat = Data.define(:event_count, :total_cost_usd, :last_event_at)

  class << self
    # @param ids [Array<String>] project UUIDs
    # @return [Hash<String, Stat>] stats per project_id (projects with no events are omitted)
    def for_project_ids(ids)
      ids = ids.compact.uniq
      return {} if ids.empty?

      ToolEvent.where(project_id: ids)
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
  end
end
