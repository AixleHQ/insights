# frozen_string_literal: true

require "rails_helper"

RSpec.describe OrganizationMembershipRemovalService do
  let(:owner) { create(:user) }
  let(:other_owner) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:owner_membership) { create(:organization_membership, user: owner, organization: organization, role: "owner") }
  let!(:other_owner_membership) do
    create(:organization_membership, user: other_owner, organization: organization, role: "owner")
  end
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: "member") }

  let(:project) { create(:project, organization: organization) }

  describe ".preview" do
    it "returns sole-owner projects and proposed new owner for admin remove" do
      create(:project_membership, :owner, user: member, project: project)

      preview = described_class.preview(membership: member_membership, actor: owner)

      expect(preview.sole_owner_projects.map(&:id)).to eq([ project.id ])
      expect(preview.new_owner).to eq(owner)
    end

    it "returns another org owner as new_owner for self-leave" do
      create(:project_membership, :owner, user: member, project: project)

      preview = described_class.preview(membership: member_membership, actor: member)

      expect(preview.new_owner).to eq(owner)
    end

    it "returns empty sole_owner_projects when the user is not a sole project owner" do
      create(:project_membership, :owner, user: owner, project: project)
      create(:project_membership, user: member, project: project, role: "member")

      preview = described_class.preview(membership: member_membership, actor: owner)

      expect(preview.sole_owner_projects).to be_empty
    end

    it "picks the earliest other org owner for self-leave" do
      owner_membership.update_columns(created_at: 2.days.ago)
      other_owner_membership.update_columns(created_at: 1.day.ago)
      create(:project_membership, :owner, user: member, project: project)

      preview = described_class.preview(membership: member_membership, actor: member)

      expect(preview.new_owner).to eq(owner)
    end

    it "falls back to an org owner when the actor is not an org member" do
      global_admin = create(:user, :global_admin)
      create(:project_membership, :owner, user: member, project: project)

      preview = described_class.preview(membership: member_membership, actor: global_admin)

      expect(preview.new_owner).to eq(owner).or eq(other_owner)
      expect(preview.new_owner).not_to eq(global_admin)
    end
  end

  describe ".call" do
    it "transfers sole-owner projects to the actor and removes all project memberships" do
      shared = create(:project, organization: organization)
      create(:project_membership, :owner, user: member, project: project)
      create(:project_membership, user: member, project: shared, role: "member")
      create(:project_membership, :owner, user: owner, project: shared)

      expect do
        described_class.call(membership: member_membership, actor: owner)
      end.to change(OrganizationMembership, :count).by(-1)

      expect(ProjectMembership.find_by(user_id: member.id, project_id: project.id)).to be_nil
      expect(ProjectMembership.find_by(user_id: member.id, project_id: shared.id)).to be_nil
      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to have_attributes(role: "owner")
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_nil
    end

    it "upgrades an existing non-owner project membership for the new owner" do
      create(:project_membership, :owner, user: member, project: project)
      create(:project_membership, user: owner, project: project, role: "viewer")

      described_class.call(membership: member_membership, actor: owner)

      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to have_attributes(role: "owner")
      expect(ProjectMembership.where(user_id: owner.id, project_id: project.id).count).to eq(1)
    end

    it "transfers sole-owner projects to another org owner on self-leave" do
      create(:project_membership, :owner, user: member, project: project)

      described_class.call(membership: member_membership, actor: member)

      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to have_attributes(role: "owner")
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_nil
    end

    it "transfers to an org owner when a global admin (non-member) removes someone" do
      global_admin = create(:user, :global_admin)
      create(:project_membership, :owner, user: member, project: project)

      described_class.call(membership: member_membership, actor: global_admin)

      transferred_to = ProjectMembership.find_by(project_id: project.id, role: "owner")
      expect(transferred_to.user_id).to be_in([ owner.id, other_owner.id ])
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_nil
    end

    it "logs a project ownership transfer audit event" do
      create(:project_membership, :owner, user: member, project: project)

      expect do
        described_class.call(membership: member_membership, actor: owner)
      end.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.order(:created_at).last
      expect(log.action).to eq("member.role_changed")
      expect(log.tracked_changes.with_indifferent_access).to include(
        reason: "org_membership_removal_transfer",
        from_user_id: member.id,
        after: "owner"
      )
    end

    it "deletes project memberships without transfer when the user is not a sole owner" do
      create(:project_membership, :owner, user: owner, project: project)
      create(:project_membership, user: member, project: project, role: "member")

      described_class.call(membership: member_membership, actor: owner)

      expect(ProjectMembership.find_by(user_id: member.id, project_id: project.id)).to be_nil
      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to have_attributes(role: "owner")
    end

    it "does not touch personal projects" do
      personal = create(:project, :personal, owner: member)
      create(:project_membership, :owner, user: member, project: personal)

      described_class.call(membership: member_membership, actor: owner)

      expect(ProjectMembership.find_by(user_id: member.id, project_id: personal.id)).to be_present
    end

    it "raises Error when sole-owner projects exist but no new owner can be resolved" do
      create(:project_membership, :owner, user: member, project: project)
      service = described_class.new(membership: member_membership, actor: owner)
      allow(service).to receive(:resolve_new_owner).and_return(nil)

      expect { service.call }.to raise_error(
        OrganizationMembershipRemovalService::Error,
        /no eligible new owner/
      )
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_present
      expect(ProjectMembership.find_by(user_id: member.id, project_id: project.id)).to be_present
    end

    it "raises RecordInvalid when the last org owner cannot be removed" do
      other_owner_membership.destroy!
      member_membership.destroy!

      expect do
        described_class.call(membership: owner_membership, actor: create(:user, :global_admin))
      end.to raise_error(ActiveRecord::RecordInvalid)

      expect(OrganizationMembership.find_by(id: owner_membership.id)).to be_present
    end

    it "raises Error when the last org owner has sole-owner projects and no transfer target" do
      other_owner_membership.destroy!
      member_membership.destroy!
      create(:project_membership, :owner, user: owner, project: project)

      expect do
        described_class.call(membership: owner_membership, actor: create(:user, :global_admin))
      end.to raise_error(OrganizationMembershipRemovalService::Error, /no eligible new owner/)

      expect(OrganizationMembership.find_by(id: owner_membership.id)).to be_present
      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to be_present
    end
  end
end
