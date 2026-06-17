# frozen_string_literal: true

# Keeps project memberships in sync when new org projects are created (AIX-381).
#
# Project visibility is gated by an explicit ProjectMembership row (see
# ProjectPolicy#relation_scope / #show?). Org owners are intentionally skipped —
# they are implicit project owners and need no membership row
# (see ApplicationPolicy#project_owner?).
class ProjectEnrollmentService
  # Maps an organization role to the project role granted on auto-enrollment.
  # Owners are excluded; "viewer" stays read-only to avoid privilege escalation.
  PROJECT_ROLE_FOR_ORG_ROLE = {
    "member" => "member",
    "viewer" => "viewer"
  }.freeze

  # Enroll every existing org member into a single (typically newly created) project.
  def self.enroll_org_members_in_project(project)
    return unless project.organization_project?

    project.organization.organization_memberships.find_each do |membership|
      role = PROJECT_ROLE_FOR_ORG_ROLE[membership.role]
      next if role.nil?

      upsert_membership(project, membership.user_id, role)
    end
  end

  # Idempotent: never clobber an explicitly assigned role (e.g. project owner).
  def self.upsert_membership(project, user_id, role)
    membership = project.project_memberships.find_or_initialize_by(user_id: user_id)
    return unless membership.new_record?

    membership.role = role
    membership.save!
  end

  private_class_method :upsert_membership
end
