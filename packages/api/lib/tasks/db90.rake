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
          tool:       event.tool_name,
          organization: event.organization
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

  # Slugs from db/seeds.rb PROJECT_TEMPLATES (name.parameterize-style: spaces → hyphens).
  DEMO_PROJECT_SLUGS = %w[
    platform-api web-dashboard mobile-app data-pipeline ml-services devops documentation
  ].freeze

  # Email LIKE pattern matching synthetic engineers created by db/seeds.rb.
  # Intentionally scoped to @example.com — stricter than the seed query
  # ("email LIKE 'engineer%'") to avoid matching engineer* accounts at other domains.
  SEED_USER_EMAIL_PATTERN = "engineer%@example.com"

  desc <<~DESC
    Delete demo projects seeded by PROJECT_TEMPLATES in db/seeds.rb for one organization.

    Does not touch projects created in the app unless their slug matches the demo list.
    Nullifies timeseries.tool_events.project_id / repository_id first (FK), then destroys the project.

    Usage (from packages/api):
      # zsh: quote the task or brackets are treated as globs — use quotes below.

      rails 'db90:cleanup_demo_projects[dry_run]'                         # list only
      rails db90:cleanup_demo_projects                                    # dualboot-partners, delete
      rails 'db90:cleanup_demo_projects[my-org-slug]'                     # delete for org slug
      rails 'db90:cleanup_demo_projects[my-org-slug,dry_run]'

    Allowed environments: development, staging (set ALLOW_PRODUCTION_CLEANUP=1 to override).
  DESC
  task :cleanup_demo_projects, [ :organization_slug, :dry_run ] => :environment do |_t, args|
    first = args[:organization_slug].to_s.strip
    second = args[:dry_run].to_s.strip

    dry_run = second.casecmp("dry_run").zero? || first.casecmp("dry_run").zero?

    unless Rails.env.development? || Rails.env.staging? || ENV["ALLOW_PRODUCTION_CLEANUP"].present?
      abort "[db90:cleanup_demo_projects] Refusing to run in #{Rails.env} " \
            "(set ALLOW_PRODUCTION_CLEANUP=1 only if you intend this)."
    end

    org_slug = first
    org_slug = "dualboot-partners" if org_slug.blank? || org_slug.casecmp("dry_run").zero?

    org = Organization.find_by(slug: org_slug)
    unless org
      abort "[db90:cleanup_demo_projects] Organization not found: slug=#{org_slug.inspect}"
    end

    projects = Project.where(organization: org, slug: DEMO_PROJECT_SLUGS).order(:slug)

    puts "[db90:cleanup_demo_projects] #{dry_run ? '[DRY RUN] ' : ''}org=#{org.slug} (#{org.name})"
    puts "[db90:cleanup_demo_projects] Demo slugs (from seeds PROJECT_TEMPLATES): #{DEMO_PROJECT_SLUGS.join(', ')}"
    puts "[db90:cleanup_demo_projects] Matching projects: #{projects.count}"
    projects.each { |p| puts "  - #{p.slug}  id=#{p.id}" }

    if projects.empty?
      puts "[db90:cleanup_demo_projects] Nothing to do."
      next
    end

    if dry_run
      puts "[db90:cleanup_demo_projects] DRY RUN — no rows deleted. Run without dry_run to destroy."
      next
    end

    projects.find_each do |project|
      ApplicationRecord.transaction do
        repo_ids = project.repositories.pluck(:id)
        ev_by_project = ToolEvent.where(project_id: project.id)
        n_proj = ev_by_project.update_all(project_id: nil, repository_id: nil)
        n_repo = repo_ids.empty? ? 0 : ToolEvent.where(repository_id: repo_ids).update_all(repository_id: nil)
        project.destroy!
        puts "[db90:cleanup_demo_projects] Destroyed #{project.slug} " \
             "(detached tool_events: by_project=#{n_proj}, by_repo=#{n_repo})"
      end
    end

    puts "[db90:cleanup_demo_projects] Done."
  end

  desc <<~DESC
    Delete unattributed demo tool events created by db/seeds.rb for one organization.

    Targets events where metadata->>'seed_batch' = 'unattributed_demo' (the 10 rows
    seeded for the manual-attribution QA demo).  Safe to run independently; also run
    this BEFORE db90:cleanup_demo_projects to avoid any dependency on which project
    those rows reference.

    Usage (from packages/api):
      rails 'db90:cleanup_demo_events[dry_run]'
      rails db90:cleanup_demo_events
      rails 'db90:cleanup_demo_events[my-org-slug]'
      rails 'db90:cleanup_demo_events[my-org-slug,dry_run]'

    Allowed environments: development, staging (set ALLOW_PRODUCTION_CLEANUP=1 to override).
  DESC
  task :cleanup_demo_events, [ :organization_slug, :dry_run ] => :environment do |_t, args|
    first  = args[:organization_slug].to_s.strip
    second = args[:dry_run].to_s.strip

    dry_run = second.casecmp("dry_run").zero? || first.casecmp("dry_run").zero?

    unless Rails.env.development? || Rails.env.staging? || ENV["ALLOW_PRODUCTION_CLEANUP"].present?
      abort "[db90:cleanup_demo_events] Refusing to run in #{Rails.env} " \
            "(set ALLOW_PRODUCTION_CLEANUP=1 only if you intend this)."
    end

    org_slug = first
    org_slug = "dualboot-partners" if org_slug.blank? || org_slug.casecmp("dry_run").zero?

    org = Organization.find_by(slug: org_slug)
    unless org
      abort "[db90:cleanup_demo_events] Organization not found: slug=#{org_slug.inspect}"
    end

    scope = ToolEvent.where(organization: org).where("metadata->>'seed_batch' = ?", "unattributed_demo")
    count = scope.count

    puts "[db90:cleanup_demo_events] #{dry_run ? '[DRY RUN] ' : ''}org=#{org.slug} (#{org.name})"
    puts "[db90:cleanup_demo_events] Events with seed_batch='unattributed_demo': #{count}"

    if count == 0
      puts "[db90:cleanup_demo_events] Nothing to do."
      next
    end

    if dry_run
      puts "[db90:cleanup_demo_events] DRY RUN — no rows deleted. Run without dry_run to destroy."
      next
    end

    deleted = scope.delete_all
    puts "[db90:cleanup_demo_events] Deleted #{deleted} demo event(s)."
    puts "[db90:cleanup_demo_events] Done."
  end

  desc <<~DESC
    Delete synthetic engineer* users seeded by db/seeds.rb for one organization.

    Matches users whose email matches '#{SEED_USER_EMAIL_PATTERN}'.
    NOTE: the email match is global — organization_slug is used only for dry-run
    reporting context and does not limit which user records are removed.

    Deletion order (FK-safe):
      1. ToolEvents          — delete_all (restrict_with_error on User)
      2. AdminAuditLogs      — delete_all (restrict_with_error on User)
      3. ProjectAuditLogs    — update_all(actor_id: nil)
      4. OrganizationAuditLogs — update_all(actor_id: nil)
      5. Issues              — update_all(assignee_id: nil)
      6. OrganizationRetentionPolicies — update_all(updated_by_id: nil)
      7. ProjectRetentionPolicies      — update_all(updated_by_id: nil)
      8. User.destroy_all    — cascades memberships, tool accounts, settings, invitations

    Remaining synthetic data: db/seeds.rb reassigns ~1500 events per real dev user
    (KNOWN_DEV_USERS) via update_all(user_id: real_user.id).  Those events now sit on
    real user IDs and are NOT removed by this task.  Real dev accounts will still show
    synthetic usage history after cleanup.

    Usage (from packages/api):
      rails 'db90:cleanup_seed_users[dry_run]'
      rails db90:cleanup_seed_users
      rails 'db90:cleanup_seed_users[my-org-slug]'
      rails 'db90:cleanup_seed_users[my-org-slug,dry_run]'

    Allowed environments: development, staging (set ALLOW_PRODUCTION_CLEANUP=1 to override).
  DESC
  task :cleanup_seed_users, [ :organization_slug, :dry_run ] => :environment do |_t, args|
    first  = args[:organization_slug].to_s.strip
    second = args[:dry_run].to_s.strip

    dry_run = second.casecmp("dry_run").zero? || first.casecmp("dry_run").zero?

    unless Rails.env.development? || Rails.env.staging? || ENV["ALLOW_PRODUCTION_CLEANUP"].present?
      abort "[db90:cleanup_seed_users] Refusing to run in #{Rails.env} " \
            "(set ALLOW_PRODUCTION_CLEANUP=1 only if you intend this)."
    end

    org_slug = first
    org_slug = "dualboot-partners" if org_slug.blank? || org_slug.casecmp("dry_run").zero?

    org = Organization.find_by(slug: org_slug)
    unless org
      abort "[db90:cleanup_seed_users] Organization not found: slug=#{org_slug.inspect}"
    end

    seed_users = User.where("email LIKE ?", SEED_USER_EMAIL_PATTERN)
    seed_user_ids = seed_users.pluck(:id)

    puts "[db90:cleanup_seed_users] #{dry_run ? '[DRY RUN] ' : ''}org=#{org.slug} (#{org.name})"
    puts "[db90:cleanup_seed_users] Email pattern: #{SEED_USER_EMAIL_PATTERN}"
    puts "[db90:cleanup_seed_users] Matching users: #{seed_user_ids.size}"

    if seed_user_ids.empty?
      puts "[db90:cleanup_seed_users] Nothing to do."
      next
    end

    tool_events_count       = ToolEvent.where(user_id: seed_user_ids).count
    admin_audit_logs_count  = AdminAuditLog.where(admin_user_id: seed_user_ids).count
    project_audit_logs_count = ProjectAuditLog.where(actor_id: seed_user_ids).count
    org_audit_logs_count    = OrganizationAuditLog.where(actor_id: seed_user_ids).count
    issues_count            = Issue.where(assignee_id: seed_user_ids).count
    org_retention_count     = OrganizationRetentionPolicy.where(updated_by_id: seed_user_ids).count
    proj_retention_count    = ProjectRetentionPolicy.where(updated_by_id: seed_user_ids).count

    puts "[db90:cleanup_seed_users]   tool_events to delete:              #{tool_events_count}"
    puts "[db90:cleanup_seed_users]   admin_audit_logs to delete:         #{admin_audit_logs_count}"
    puts "[db90:cleanup_seed_users]   project_audit_logs to nullify:      #{project_audit_logs_count}"
    puts "[db90:cleanup_seed_users]   organization_audit_logs to nullify: #{org_audit_logs_count}"
    puts "[db90:cleanup_seed_users]   issues to nullify:                  #{issues_count}"
    puts "[db90:cleanup_seed_users]   org_retention_policies to nullify:  #{org_retention_count}"
    puts "[db90:cleanup_seed_users]   proj_retention_policies to nullify: #{proj_retention_count}"

    if dry_run
      puts "[db90:cleanup_seed_users] DRY RUN — no rows deleted. Run without dry_run to destroy."
      next
    end

    ApplicationRecord.transaction do
      ToolEvent.where(user_id: seed_user_ids).delete_all
      AdminAuditLog.where(admin_user_id: seed_user_ids).delete_all
      ProjectAuditLog.where(actor_id: seed_user_ids).update_all(actor_id: nil)
      OrganizationAuditLog.where(actor_id: seed_user_ids).update_all(actor_id: nil)
      Issue.where(assignee_id: seed_user_ids).update_all(assignee_id: nil)
      OrganizationRetentionPolicy.where(updated_by_id: seed_user_ids).update_all(updated_by_id: nil)
      ProjectRetentionPolicy.where(updated_by_id: seed_user_ids).update_all(updated_by_id: nil)

      destroyed = User.where(id: seed_user_ids).destroy_all
      puts "[db90:cleanup_seed_users] Destroyed #{destroyed.size} seed user(s)."
    end

    puts "[db90:cleanup_seed_users] Done."
  end
end
