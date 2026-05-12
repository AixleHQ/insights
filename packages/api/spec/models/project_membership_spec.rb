# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProjectMembership, type: :model do
  describe "constants" do
    it "defines valid roles without admin" do
      expect(described_class::ROLES).to eq(%w[owner member viewer])
      expect(described_class::ROLES).not_to include("admin")
    end
  end

  describe "associations" do
    it { is_expected.to belong_to(:user) }
    it { is_expected.to belong_to(:project) }
    it { is_expected.to belong_to(:created_by).class_name("User").optional }
  end

  describe "validations" do
    subject { build(:project_membership) }

    it { is_expected.to validate_presence_of(:role) }
    it { is_expected.to validate_inclusion_of(:role).in_array(ProjectMembership::ROLES) }

    it "rejects admin role" do
      membership = build(:project_membership, role: "admin")
      expect(membership).not_to be_valid
      expect(membership.errors[:role]).to be_present
    end

    it "validates uniqueness of user per project" do
      user = create(:user)
      personal_project = create(:project, owner: user, organization: nil)
      membership = create(:project_membership, user: user, project: personal_project, role: "owner")
      duplicate = build(:project_membership, user: user, project: personal_project)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:user_id]).to include("is already a member of this project")
    end

    describe "org membership ceiling" do
      let(:organization) { create(:organization) }
      let(:project) { create(:project, organization: organization) }
      let(:org_member) { create(:user) }
      let(:outsider) { create(:user) }
      let(:existing_owner) { create(:user) }

      before do
        create(:organization_membership, user: org_member, organization: organization)
        create(:organization_membership, user: existing_owner, organization: organization)
        create(:project_membership, user: existing_owner, project: project, role: "owner") # satisfy last-owner guard
      end

      it "allows adding an org member" do
        membership = build(:project_membership, user: org_member, project: project, role: "member")
        expect(membership).to be_valid
      end

      it "rejects adding a user who is not an org member" do
        membership = build(:project_membership, user: outsider, project: project, role: "member")
        expect(membership).not_to be_valid
        expect(membership.errors[:user_id]).to include("must be a member of the project's organization")
      end

      it "skips ceiling check for personal projects" do
        outsider = create(:user)
        personal_project = create(:project, owner: outsider, organization: nil)
        membership = build(:project_membership, user: outsider, project: personal_project, role: "owner")
        expect(membership).to be_valid
      end
    end

    describe "last owner protection on role downgrade" do
      let(:organization) { create(:organization) }
      let(:project) { create(:project, organization: organization) }

      def create_org_project_membership(user, role)
        create(:organization_membership, user: user, organization: organization)
        create(:project_membership, user: user, project: project, role: role)
      end

      it "prevents downgrading the last owner" do
        owner_user = create(:user)
        owner_membership = create_org_project_membership(owner_user, "owner")
        owner_membership.role = "member"
        expect(owner_membership).not_to be_valid
        expect(owner_membership.errors[:role]).to include("Cannot downgrade the last owner of a project")
      end

      it "allows downgrading an owner when another owner exists" do
        owner_user = create(:user)
        second_owner = create(:user)
        owner_membership = create_org_project_membership(owner_user, "owner")
        create_org_project_membership(second_owner, "owner")
        owner_membership.role = "member"
        expect(owner_membership).to be_valid
      end
    end
  end

  describe "last owner protection on destroy" do
    let(:organization) { create(:organization) }
    let(:project) { create(:project, organization: organization) }

    def create_org_project_membership(user, role)
      create(:organization_membership, user: user, organization: organization)
      create(:project_membership, user: user, project: project, role: role)
    end

    it "prevents destroying the last owner membership" do
      owner_user = create(:user)
      owner_membership = create_org_project_membership(owner_user, "owner")
      expect(owner_membership.destroy).to be_falsey
      expect(owner_membership.errors[:base]).to include("Cannot remove the last owner of a project")
      expect(described_class.exists?(owner_membership.id)).to be true
    end

    it "allows destroying an owner membership when another owner exists" do
      owner_user = create(:user)
      second_owner = create(:user)
      owner_membership = create_org_project_membership(owner_user, "owner")
      create_org_project_membership(second_owner, "owner")
      expect(owner_membership.destroy).to be_truthy
    end

    it "allows destroying a non-owner membership regardless" do
      owner_user = create(:user)
      member_user = create(:user)
      create_org_project_membership(owner_user, "owner")
      member_membership = create_org_project_membership(member_user, "member")
      expect(member_membership.destroy).to be_truthy
    end

    it "allows cascaded destroy when project itself is being destroyed" do
      owner_user = create(:user)
      owner_membership = create_org_project_membership(owner_user, "owner")
      expect { project.destroy! }.not_to raise_error
      expect(described_class.exists?(owner_membership.id)).to be false
    end
  end

  describe "scopes" do
    let(:organization) { create(:organization) }
    let(:project) { create(:project, organization: organization) }

    def create_org_project_membership(user, role)
      create(:organization_membership, user: user, organization: organization)
      create(:project_membership, user: user, project: project, role: role)
    end

    describe ".owners" do
      it "returns only owner memberships" do
        owner_user = create(:user)
        member_user = create(:user)
        owner_membership = create_org_project_membership(owner_user, "owner")
        member_membership = create_org_project_membership(member_user, "member")
        expect(described_class.owners).to include(owner_membership)
        expect(described_class.owners).not_to include(member_membership)
      end
    end

    describe ".admins" do
      it "is an alias for .owners post-admin-removal" do
        owner_user = create(:user)
        member_user = create(:user)
        owner_membership = create_org_project_membership(owner_user, "owner")
        member_membership = create_org_project_membership(member_user, "member")
        expect(described_class.admins).to include(owner_membership)
        expect(described_class.admins).not_to include(member_membership)
      end
    end
  end

  describe "#owner?" do
    it "returns true for owner role" do
      expect(build(:project_membership, role: "owner").owner?).to be true
    end

    it "returns false for member role" do
      expect(build(:project_membership, role: "member").owner?).to be false
    end
  end

  describe "#admin?" do
    it "returns true for owner (admin == owner post-AIX-202)" do
      expect(build(:project_membership, role: "owner").admin?).to be true
    end

    it "returns false for member" do
      expect(build(:project_membership, role: "member").admin?).to be false
    end
  end

  describe "#can_edit?" do
    it "returns true for owner" do
      expect(build(:project_membership, role: "owner").can_edit?).to be true
    end

    it "returns true for member" do
      expect(build(:project_membership, role: "member").can_edit?).to be true
    end

    it "returns false for viewer" do
      expect(build(:project_membership, role: "viewer").can_edit?).to be false
    end
  end
end
