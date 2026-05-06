# frozen_string_literal: true

namespace :db90 do
  desc <<~DESC
    Backfill cost_usd for ToolEvents where tokens_in is present but cost_usd is nil.

    Calls ModelPricingService.calculate_cost for each qualifying event, sets cost_usd,
    and stamps metadata['cost_source'] = 'backfill'. Idempotent — skips events where
    cost_usd is already non-nil.

    Usage:
      rails db90:backfill_event_costs           # live run
      rails db90:backfill_event_costs[dry_run]  # report only, no writes
  DESC
  task :backfill_event_costs, [ :dry_run ] => :environment do |_t, args|
    dry_run = args[:dry_run].to_s.strip.downcase == "dry_run"

    scope = ToolEvent.where(cost_usd: nil).where.not(tokens_in: nil)
    total = scope.count

    puts "[db90:backfill_event_costs] #{dry_run ? '[DRY RUN] ' : ''}Starting backfill"
    puts "[db90:backfill_event_costs] Events to process: #{total}"
    puts "[db90:backfill_event_costs] Batch size: 500"
    puts ""

    processed = 0
    updated   = 0
    skipped   = 0
    errors    = 0

    scope.find_in_batches(batch_size: 500) do |batch|
      batch.each do |event|
        processed += 1

        result = ModelPricingService.calculate_cost(
          tokens_in:  event.tokens_in,
          tokens_out: event.tokens_out.to_i,
          model:      event.model,
          tool:       event.tool_name
        )
        total_cost = result[:total_cost]

        if total_cost.nil? || total_cost <= 0
          skipped += 1
          next
        end

        if dry_run
          puts "  [DRY RUN] id=#{event.id} tool=#{event.tool_name} model=#{event.model.inspect} " \
               "tokens_in=#{event.tokens_in} tokens_out=#{event.tokens_out} " \
               "→ cost_usd=#{total_cost}"
          updated += 1
        else
          new_metadata = (event.metadata || {}).merge("cost_source" => "backfill")
          event.update_columns(cost_usd: total_cost, metadata: new_metadata)
          updated += 1
        end
      rescue => e
        errors += 1
        warn "  [ERROR] id=#{event.id}: #{e.class}: #{e.message}"
      end

      puts "[db90:backfill_event_costs] Progress: #{processed}/#{total} processed, #{updated} #{dry_run ? 'would be ' : ''}updated, #{skipped} skipped, #{errors} errors"
    end

    puts ""
    puts "[db90:backfill_event_costs] Done."
    puts "  Total processed : #{processed}"
    puts "  #{dry_run ? 'Would update' : 'Updated'}      : #{updated}"
    puts "  Skipped         : #{skipped}"
    puts "  Errors          : #{errors}"

    exit 1 if errors > 0
  end
end
