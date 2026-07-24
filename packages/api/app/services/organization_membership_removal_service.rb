# frozen_string_literal: true

# Removes an organization membership and cleans up the user's project memberships
# on that org's projects. Sole project ownership is transferred before delete so
# ProjectMembership's last-owner guard does not block the cascade.
#
# Transfer target:
# - Admin/owner remove → actor when they are an org member; otherwise earliest other org owner
# - Self-leave → earliest other org owner by organization_memberships.created_at
class OrganizationMembershipRemovalService
  Preview = Data.define(:sole_owner_projects, :new_owner)

  class Error < StandardError; end

  def self.preview(membership:, actor:)
    new(membership:, actor:).preview
  end

  def self.call(membership:, actor:)
    new(membership:, actor:).call
  end

  def initialize(membership:, actor:)
    @membership = membership
    @actor = actor
    @organization = membership.organization
    @departing_user = membership.user
  end

  def preview
    Preview.new(
      sole_owner_projects: sole_owner_projects.to_a,
      new_owner: resolve_new_owner
    )
  end

  def call
    ActiveRecord::Base.transaction do
      projects = sole_owner_projects.to_a
      new_owner = resolve_new_owner

      if projects.any? && new_owner.nil?
        raise Error, "Cannot transfer sole-owner projects: no eligible new owner"
      end

      projects.each { |project| transfer_ownership!(project, new_owner) }
      destroy_project_memberships!
      destroy_organization_membership!
    end

    true
  end

  private

  attr_reader :membership, :actor, :organization, :departing_user

  def self_leave?
    actor.id == departing_user.id
  end

  def resolve_new_owner
    if self_leave?
      other_org_owners.first&.user
    elsif actor_org_member?
      actor
    else
      other_org_owners.first&.user
    end
  end

  def actor_org_member?
    organization.organization_memberships.exists?(user_id: actor.id)
  end

  def other_org_owners
    organization.organization_memberships.owners
      .where.not(user_id: departing_user.id)
      .order(:created_at)
  end

  def sole_owner_projects
    Project
      .joins(:project_memberships)
      .where(organization_id: organization.id)
      .where(project_memberships: { user_id: departing_user.id, role: "owner" })
      .where(
        <<~SQL.squish
          (
            SELECT COUNT(*)
            FROM project_memberships pm2
            WHERE pm2.project_id = projects.id
              AND pm2.role = 'owner'
          ) = 1
        SQL
      )
      .distinct
  end

  def transfer_ownership!(project, new_owner)
    target = ProjectMembership.find_or_initialize_by(
      user_id: new_owner.id,
      project_id: project.id
    )
    previous_role = target.persisted? ? target.role : nil
    target.role = "owner"
    target.created_by ||= actor
    target.save!

    ProjectAuditLog.log(
      project: project,
      actor: actor,
      action: "member.role_changed",
      resource: target,
      tracked_changes: {
        user_id: new_owner.id,
        before: previous_role,
        after: "owner",
        reason: "org_membership_removal_transfer",
        from_user_id: departing_user.id
      }
    )
  end

  def destroy_project_memberships!
    ProjectMembership
      .joins(:project)
      .where(user_id: departing_user.id, projects: { organization_id: organization.id })
      .find_each do |project_membership|
        project_membership.destroy!
      end
  end

  def destroy_organization_membership!
    unless membership.destroy
      raise ActiveRecord::RecordInvalid, membership
    end
  end
end
