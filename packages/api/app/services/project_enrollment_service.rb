# frozen_string_literal: true

# Keeps org members' project access in sync (AIX-381).
#
# Project visibility is gated by an explicit ProjectMembership row (see
# ProjectPolicy#relation_scope / #show?). To honour "members see the org's
# existing projects" while keeping that gate, every org member is auto-enrolled
# into every org project. Org owners are intentionally skipped — they are
# implicit project owners and need no membership row
# (see ApplicationPolicy#project_owner?).
class ProjectEnrollmentService
  # Maps an organization role to the project role granted on auto-enrollment.
  # Owners are excluded; "viewer" stays read-only to avoid privilege escalation.
  PROJECT_ROLE_FOR_ORG_ROLE = {
    "member" => "member",
    "viewer" => "viewer"
  }.freeze

  # Enroll a single org member into every project of their organization.
  def self.enroll_user_in_org_projects(membership)
    role = PROJECT_ROLE_FOR_ORG_ROLE[membership.role]
    return if role.nil?

    membership.organization.projects.find_each do |project|
      upsert_membership(project, membership.user_id, role)
    end
  end

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
