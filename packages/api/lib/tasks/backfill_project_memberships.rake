# frozen_string_literal: true

namespace :backfill do
  desc "Auto-enroll existing org members into their org's projects so they can see org data (AIX-381)"
  task project_memberships: :environment do
    dry_run = ENV.fetch("DRY_RUN", "false") == "true"

    memberships = OrganizationMembership.where(role: ProjectEnrollmentService::PROJECT_ROLE_FOR_ORG_ROLE.keys)

    puts "[backfill:project_memberships] #{memberships.count} non-owner org memberships to enroll"
    puts "[backfill:project_memberships] DRY_RUN=true — no writes will occur" if dry_run

    before = ProjectMembership.count

    memberships.find_each do |membership|
      if dry_run
        pending = membership.organization.projects.where.not(
          id: ProjectMembership.where(user_id: membership.user_id).select(:project_id)
        ).count
        puts "[backfill:project_memberships] user=#{membership.user_id} org=#{membership.organization_id} would enroll into #{pending} project(s)"
        next
      end

      ProjectEnrollmentService.enroll_user_in_org_projects(membership)
    end

    unless dry_run
      created = ProjectMembership.count - before
      puts "[backfill:project_memberships] created #{created} project membership(s)"
    end
  end
end
