# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProjectMembershipPolicy, type: :policy do
  let(:org_owner_user) { create(:user) }
  let(:project_owner_user) { create(:user) }
  let(:member_user) { create(:user) }
  let(:outsider) { create(:user) }
  let(:global_admin_user) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:org_project) { create(:project, organization: organization, owner: nil) }
  let(:personal_project) { create(:project, owner: org_owner_user, organization: nil) }

  before do
    create(:organization_membership, user: org_owner_user, organization: organization, role: "owner")
    create(:organization_membership, user: project_owner_user, organization: organization)
    create(:organization_membership, user: member_user, organization: organization)
  end

  let!(:project_owner_membership) { create(:project_membership, user: project_owner_user, project: org_project, role: "owner") }
  let!(:member_membership) { create(:project_membership, user: member_user, project: org_project, role: "member") }

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe "organization project memberships" do
    describe "#index? / #show?" do
      it "allows org owner (no project row needed)" do
        expect(policy(member_membership, current_user: org_owner_user).apply(:index?)).to be true
      end

      it "allows project row-owner" do
        expect(policy(member_membership, current_user: project_owner_user).apply(:index?)).to be true
      end

      it "allows project member (AIX-117: members see read-only list)" do
        expect(policy(member_membership, current_user: member_user).apply(:index?)).to be true
      end

      it "denies outsiders" do
        expect(policy(member_membership, current_user: outsider).apply(:index?)).to be false
      end

      it "allows global admins" do
        expect(policy(member_membership, current_user: global_admin_user).apply(:index?)).to be true
      end
    end

    describe "#stats?" do
      it "allows org owner" do
        expect(policy(member_membership, current_user: org_owner_user).apply(:stats?)).to be true
      end

      it "allows project row-owner" do
        expect(policy(member_membership, current_user: project_owner_user).apply(:stats?)).to be true
      end

      it "denies project member" do
        expect(policy(member_membership, current_user: member_user).apply(:stats?)).to be false
      end
    end

    describe "#create?" do
      let(:new_member) { create(:user) }

      before { create(:organization_membership, user: new_member, organization: organization) }

      it "allows org owner" do
        record = ProjectMembership.new(user: new_member, project: org_project, role: "member")
        expect(policy(record, current_user: org_owner_user).apply(:create?)).to be true
      end

      it "denies project row-owner who is not org owner" do
        record = ProjectMembership.new(user: new_member, project: org_project, role: "member")
        expect(policy(record, current_user: project_owner_user).apply(:create?)).to be false
      end

      it "denies project members" do
        record = ProjectMembership.new(user: new_member, project: org_project, role: "member")
        expect(policy(record, current_user: member_user).apply(:create?)).to be false
      end

      it "allows global admins" do
        record = ProjectMembership.new(user: new_member, project: org_project, role: "member")
        expect(policy(record, current_user: global_admin_user).apply(:create?)).to be true
      end
    end

    describe "#update?" do
      it "allows org owner to update any membership" do
        expect(policy(member_membership, current_user: org_owner_user).apply(:update?)).to be true
      end

      it "allows org owner to update owner rows (model handles last-owner guard)" do
        expect(policy(project_owner_membership, current_user: org_owner_user).apply(:update?)).to be true
      end

      it "denies project row-owner who is not org owner" do
        expect(policy(member_membership, current_user: project_owner_user).apply(:update?)).to be false
      end

      it "allows global admins" do
        expect(policy(member_membership, current_user: global_admin_user).apply(:update?)).to be true
      end
    end

    describe "#destroy?" do
      it "allows org owner to remove any membership" do
        expect(policy(member_membership, current_user: org_owner_user).apply(:destroy?)).to be true
      end

      it "denies project row-owner who is not org owner" do
        expect(policy(member_membership, current_user: project_owner_user).apply(:destroy?)).to be false
      end

      it "allows global admins" do
        expect(policy(member_membership, current_user: global_admin_user).apply(:destroy?)).to be true
      end
    end
  end

  describe "personal project memberships" do
    let!(:personal_membership) { create(:project_membership, user: member_user, project: personal_project, role: "member") }

    describe "#index? / #show?" do
      it "allows personal project owner" do
        expect(policy(personal_membership, current_user: org_owner_user).apply(:index?)).to be true
      end

      it "denies non-owners" do
        expect(policy(personal_membership, current_user: member_user).apply(:index?)).to be false
      end
    end

    describe "#create? / #update? / #destroy?" do
      it "allows personal project owner to create memberships" do
        expect(policy(personal_membership, current_user: org_owner_user).apply(:create?)).to be true
      end

      it "denies other users for create?" do
        expect(policy(personal_membership, current_user: member_user).apply(:create?)).to be false
      end

      it "allows personal project owner to update memberships" do
        expect(policy(personal_membership, current_user: org_owner_user).apply(:update?)).to be true
      end

      it "denies other users for update?" do
        expect(policy(personal_membership, current_user: member_user).apply(:update?)).to be false
      end

      it "allows personal project owner to destroy memberships" do
        expect(policy(personal_membership, current_user: org_owner_user).apply(:destroy?)).to be true
      end

      it "denies other users for destroy?" do
        expect(policy(personal_membership, current_user: member_user).apply(:destroy?)).to be false
      end
    end
  end
end
