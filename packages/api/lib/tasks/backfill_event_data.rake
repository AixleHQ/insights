# frozen_string_literal: true

namespace :backfill do
  desc "Promote model from metadata and recalculate cost_usd for events missing either field (AIX-192)"
  task event_data: :environment do
    batch_size = ENV.fetch("BATCH_SIZE", 500).to_i
    dry_run    = ENV.fetch("DRY_RUN", "false") == "true"

    promoted_model = 0
    enriched_cost  = 0
    skipped        = 0

    # Find events where model column is nil but metadata carries a non-empty model string.
    candidates = ToolEvent
      .where(model: nil)
      .where("metadata->>'model' IS NOT NULL")
      .where("metadata->>'model' != ''")

    puts "[backfill:event_data] #{candidates.count} events with null model + metadata model"
    puts "[backfill:event_data] DRY_RUN=true — no writes will occur" if dry_run

    candidates.find_each(batch_size: batch_size) do |event|
      meta_model = event.metadata["model"].presence
      next unless meta_model

      unless dry_run
        attrs = { model: meta_model }
        promoted_model += 1

        if (event.cost_usd.nil? || event.cost_usd.zero?) &&
           (event.tokens_in.to_i > 0 || event.tokens_out.to_i > 0)
          result = ModelPricingService.calculate_cost(
            tokens_in:    event.tokens_in.to_i,
            tokens_out:   event.tokens_out.to_i,
            model:        meta_model,
            tool:         event.tool_name,
            organization: event.organization
          )
          attrs[:cost_usd] = result[:total_cost]
          attrs[:metadata] = event.metadata.merge("cost_source" => "server_backfill")
          enriched_cost += 1
        end

        event.update!(attrs)
      else
        promoted_model += 1
        enriched_cost += 1 if event.cost_usd.nil? || event.cost_usd.zero?
      end
    rescue => e
      puts "[backfill:event_data] ERROR on event #{event.id}: #{e.message}"
      skipped += 1
    end

    puts "[backfill:event_data] Done. promoted_model=#{promoted_model} enriched_cost=#{enriched_cost} skipped=#{skipped}"
  end
end
