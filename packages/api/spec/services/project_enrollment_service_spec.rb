# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProjectEnrollmentService do
  let(:organization) { create(:organization) }

  describe ".enroll_user_in_org_projects" do
    let(:user) { create(:user) }
    let!(:project_a) { create(:project, organization: organization, owner: nil) }
    let!(:project_b) { create(:project, organization: organization, owner: nil) }

    it "enrolls a member into every org project as a project member" do
      membership = create(:organization_membership, user: user, organization: organization, role: "member")

      described_class.enroll_user_in_org_projects(membership)

      expect(user.project_memberships.pluck(:project_id)).to match_array([ project_a.id, project_b.id ])
      expect(user.project_memberships.pluck(:role).uniq).to eq([ "member" ])
    end

    it "maps an org viewer to a project viewer (no privilege escalation)" do
      membership = create(:organization_membership, user: user, organization: organization, role: "viewer")

      described_class.enroll_user_in_org_projects(membership)

      expect(project_a.project_memberships.find_by(user: user).role).to eq("viewer")
    end

    it "skips org owners (they are implicit project owners)" do
      membership = create(:organization_membership, user: user, organization: organization, role: "owner")

      described_class.enroll_user_in_org_projects(membership)

      expect(user.project_memberships).to be_empty
    end

    it "is idempotent and never clobbers an explicit role" do
      membership = create(:organization_membership, user: user, organization: organization, role: "member")
      create(:project_membership, user: user, project: project_a, role: "owner")

      described_class.enroll_user_in_org_projects(membership)

      expect(project_a.project_memberships.find_by(user: user).role).to eq("owner")
      expect(project_b.project_memberships.find_by(user: user).role).to eq("member")
      expect(user.project_memberships.count).to eq(2)
    end
  end

  describe ".enroll_org_members_in_project" do
    let(:owner) { create(:user) }
    let(:member) { create(:user) }
    let(:viewer) { create(:user) }

    before do
      create(:organization_membership, user: owner, organization: organization, role: "owner")
      create(:organization_membership, user: member, organization: organization, role: "member")
      create(:organization_membership, user: viewer, organization: organization, role: "viewer")
    end

    it "enrolls existing non-owner members into the project with mapped roles" do
      project = create(:project, organization: organization, owner: nil)

      described_class.enroll_org_members_in_project(project)

      expect(project.project_memberships.find_by(user: member)&.role).to eq("member")
      expect(project.project_memberships.find_by(user: viewer)&.role).to eq("viewer")
      expect(project.project_memberships.find_by(user: owner)).to be_nil
    end

    it "does nothing for a personal project" do
      personal = create(:project, :personal)

      expect { described_class.enroll_org_members_in_project(personal) }
        .not_to change(ProjectMembership, :count)
    end
  end
end
