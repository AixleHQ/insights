# frozen_string_literal: true

module Backfills
  # Conservative backfill: set timeseries.tool_events.project_id only for users who have
  # exactly one project membership in the event's organization. See db90:backfill_project_attribution.
  #
  # Dry-run: pass dry_run: true from the caller. The rake task enables this only via
  # db90:backfill_project_attribution[dry_run]; ENV["DRY_RUN"] is not read.
  #
  # Timescale: each batch plucks ids with (organization_id, user_id, project_id IS NULL) but no
  # time column unless ENV["BACKFILL_FROM"] is set, so PostgreSQL may touch many hypertable chunks
  # for long-lived users. Operators should watch chunk decompression / I/O during the run; set
  # BACKFILL_FROM to an ISO8601 (Time.zone.parse) lower bound on occurred_at to narrow scans (opt-in
  # performance knob, not required for correctness).
  class ProjectAttributionBackfill
    BATCH_SIZE = 1000

    def self.run(dry_run: false)
      new(dry_run:, backfill_from: backfill_from_from_env).run
    end

    def self.backfill_from_from_env
      raw = ENV.fetch("BACKFILL_FROM", "").to_s.strip
      return nil if raw.blank?

      parsed = Time.zone.parse(raw)
      if parsed.blank?
        msg = "[db90:backfill_project_attribution] BACKFILL_FROM=#{raw.inspect} is not a valid time; ignoring."
        Rails.logger.warn(msg)
        puts msg
        return nil
      end

      parsed
    end
    private_class_method :backfill_from_from_env

    def initialize(dry_run:, backfill_from: nil)
      @dry_run = dry_run
      @backfill_from = backfill_from
      @organizations_scanned = 0
      @events_updated_total = 0
      @would_update_total = 0
    end

    def run
      if @backfill_from
        msg = "[db90:backfill_project_attribution] BACKFILL_FROM=#{@backfill_from.iso8601} " \
              "(only occurred_at >= this time are scanned and updated)"
        Rails.logger.info(msg)
        puts msg
      end

      Organization.find_each do |org|
        process_organization(org)
      end
      summary_stats
    end

    private

    def summary_stats
      if @dry_run
        { organizations_scanned: @organizations_scanned, would_update_events: @would_update_total }
      else
        { organizations_scanned: @organizations_scanned, events_updated: @events_updated_total }
      end
    end

    def process_organization(org)
      @organizations_scanned += 1
      null_user_scope = with_occurred_at_floor(
        ToolEvent.where(organization_id: org.id, user_id: nil, project_id: nil)
      )
      nu = null_user_scope.count
      if nu.positive?
        msg = "[db90:backfill_project_attribution] org=#{org.slug} events with user_id NULL " \
              "and project_id NULL (skipped): #{nu}"
        Rails.logger.info(msg)
        puts msg
      end

      unambiguous_pairs, ambiguous_user_ids = membership_unambiguous_and_ambiguous(org)
      unambiguous_pairs.each do |user_id, project_id|
        scope = with_occurred_at_floor(
          ToolEvent.where(organization_id: org.id, user_id: user_id, project_id: nil)
        )
        if @dry_run
          n = scope.count
          next if n.zero?

          @would_update_total += n
          msg = "[db90:backfill_project_attribution] [DRY RUN] org=#{org.slug} user_id=#{user_id} " \
                "project_id=#{project_id} would_update_events=#{n}"
          Rails.logger.info(msg)
          puts msg
        else
          attribute_in_batches(org.id, user_id, project_id)
        end
      end

      log_ambiguous_users(org, ambiguous_user_ids)
    end

    # One grouped scan of project memberships per org; splits users by distinct project count.
    def membership_unambiguous_and_ambiguous(org)
      rows = ProjectMembership
        .joins(:project)
        .where(projects: { organization_id: org.id })
        .group(:user_id)
        .pluck(
          :user_id,
          Arel.sql("COUNT(DISTINCT project_memberships.project_id)"),
          Arel.sql("(ARRAY_AGG(DISTINCT project_memberships.project_id))[1]")
        )

      unambiguous_pairs = []
      ambiguous_user_ids = []
      rows.each do |user_id, project_count, any_project_id|
        case project_count
        when 1
          unambiguous_pairs << [ user_id, any_project_id ]
        else
          ambiguous_user_ids << user_id if project_count > 1
        end
      end

      [ unambiguous_pairs, ambiguous_user_ids ]
    end

    def log_ambiguous_users(org, ambiguous_user_ids)
      return if ambiguous_user_ids.empty?

      with_occurred_at_floor(
        ToolEvent
          .where(organization_id: org.id, project_id: nil)
          .where(user_id: ambiguous_user_ids)
      )
        .group(:user_id)
        .count
        .each do |user_id, n|
          next if n.zero?

          msg = "[db90:backfill_project_attribution] org=#{org.slug} user_id=#{user_id} has multiple " \
                "projects in org; unattributed_events(project_id NULL)=#{n}"
          Rails.logger.info(msg)
          puts msg
        end
    end

    def with_occurred_at_floor(relation)
      return relation if @backfill_from.nil?

      relation.where(arel_occurred_at.gteq(@backfill_from))
    end

    def arel_occurred_at
      ToolEvent.arel_table[:occurred_at]
    end

    def attribute_in_batches(organization_id, user_id, project_id)
      running = 0
      loop do
        base = with_occurred_at_floor(
          ToolEvent.where(organization_id: organization_id, user_id: user_id, project_id: nil)
        )
        ids = base.limit(BATCH_SIZE).pluck(:id)
        break if ids.empty?

        updated = ToolEvent.where(id: ids, project_id: nil).update_all(project_id: project_id)
        break if updated.zero?

        @events_updated_total += updated
        running += updated
        msg = "[db90:backfill_project_attribution] org_id=#{organization_id} user_id=#{user_id} " \
              "project_id=#{project_id} batch_updated=#{updated} running_total=#{running}"
        Rails.logger.info(msg)
        puts msg
      end
    end
  end
end
