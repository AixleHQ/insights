# frozen_string_literal: true

module Backfills
  # Conservative backfill: set timeseries.tool_events.project_id only for users who have
  # exactly one project membership in the event's organization. See db90:backfill_project_attribution.
  class ProjectAttributionBackfill
    BATCH_SIZE = 1000

    def self.run(dry_run: false)
      new(dry_run:).run
    end

    def initialize(dry_run:)
      @dry_run = dry_run
      @organizations_scanned = 0
      @events_updated_total = 0
      @would_update_total = 0
    end

    def run
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
      null_user_scope = ToolEvent.where(organization_id: org.id, user_id: nil, project_id: nil)
      nu = null_user_scope.count
      if nu.positive?
        msg = "[db90:backfill_project_attribution] org=#{org.slug} events with user_id NULL " \
              "and project_id NULL (skipped): #{nu}"
        Rails.logger.info(msg)
        puts msg
      end

      tuples = unambiguous_user_project_pairs(org)
      tuples.each do |user_id, project_id|
        scope = ToolEvent.where(organization_id: org.id, user_id: user_id, project_id: nil)
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

      ambiguous_user_ids(org).each do |user_id|
        n = ToolEvent.where(organization_id: org.id, user_id: user_id, project_id: nil).count
        next if n.zero?

        msg = "[db90:backfill_project_attribution] org=#{org.slug} user_id=#{user_id} has multiple " \
              "projects in org; unattributed_events(project_id NULL)=#{n}"
        Rails.logger.info(msg)
        puts msg
      end
    end

    def unambiguous_user_project_pairs(org)
      ProjectMembership
        .joins(:project)
        .where(projects: { organization_id: org.id })
        .group(:user_id)
        .having("COUNT(DISTINCT project_memberships.project_id) = 1")
        .pluck(
          :user_id,
          Arel.sql("(ARRAY_AGG(DISTINCT project_memberships.project_id))[1]")
        )
    end

    def ambiguous_user_ids(org)
      ProjectMembership
        .joins(:project)
        .where(projects: { organization_id: org.id })
        .group(:user_id)
        .having("COUNT(DISTINCT project_memberships.project_id) > 1")
        .pluck(:user_id)
    end

    def attribute_in_batches(organization_id, user_id, project_id)
      running = 0
      loop do
        base = ToolEvent.where(organization_id: organization_id, user_id: user_id, project_id: nil)
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
