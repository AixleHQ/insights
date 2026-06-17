# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProjectEnrollmentService do
  let(:organization) { create(:organization) }

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
