# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProjectAuditLogPolicy, type: :policy do
  let(:organization) { create(:organization) }
  let(:org_owner) { create(:user) }
  let(:org_admin) { create(:user) }
  let(:org_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:project) { create(:project, organization: organization) }

  # Project-specific memberships
  let(:project_admin_user) { create(:user) }
  let(:project_member_user) { create(:user) }
  let(:project_viewer_user) { create(:user) }

  before do
    create(:organization_membership, user: org_owner, organization: organization, role: "owner")
    create(:organization_membership, user: org_admin, organization: organization, role: "admin")
    create(:organization_membership, user: org_member, organization: organization, role: "member")

    create(:organization_membership, user: project_admin_user, organization: organization, role: "member")
    create(:organization_membership, user: project_member_user, organization: organization, role: "member")
    create(:organization_membership, user: project_viewer_user, organization: organization, role: "viewer")

    create(:project_membership, user: project_admin_user, project: project, role: "admin")
    create(:project_membership, user: project_member_user, project: project, role: "member")
    create(:project_membership, user: project_viewer_user, project: project, role: "viewer")
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe "#index?" do
    context "for an org project" do
      it "allows org owner" do
        expect(policy(project, current_user: org_owner).apply(:index?)).to be true
      end

      it "allows org admin" do
        expect(policy(project, current_user: org_admin).apply(:index?)).to be true
      end

      it "allows project admin (non-org-admin)" do
        expect(policy(project, current_user: project_admin_user).apply(:index?)).to be true
      end

      it "denies project member" do
        expect(policy(project, current_user: project_member_user).apply(:index?)).to be false
      end

      it "denies project viewer" do
        expect(policy(project, current_user: project_viewer_user).apply(:index?)).to be false
      end

      it "allows global admin" do
        expect(policy(project, current_user: global_admin).apply(:index?)).to be true
      end

      it "denies org member with no project role" do
        expect(policy(project, current_user: org_member).apply(:index?)).to be false
      end
    end

    context "for a personal project" do
      let(:personal_owner) { create(:user) }
      let(:personal_project) { create(:project, :personal, owner: personal_owner) }
      let(:other_user) { create(:user) }

      it "allows the personal project owner" do
        expect(policy(personal_project, current_user: personal_owner).apply(:index?)).to be true
      end

      it "denies another user" do
        expect(policy(personal_project, current_user: other_user).apply(:index?)).to be false
      end

      it "allows global admin" do
        expect(policy(personal_project, current_user: global_admin).apply(:index?)).to be true
      end
    end
  end

  describe "#show?" do
    it "mirrors index? — allows project admin" do
      expect(policy(project, current_user: project_admin_user).apply(:show?)).to be true
    end

    it "mirrors index? — denies project member" do
      expect(policy(project, current_user: project_member_user).apply(:show?)).to be false
    end
  end

  describe "#full_access?" do
    it "grants org owner full access" do
      expect(policy(project, current_user: org_owner).apply(:full_access?)).to be true
    end

    it "grants org admin full access" do
      expect(policy(project, current_user: org_admin).apply(:full_access?)).to be true
    end

    it "grants global admin full access" do
      expect(policy(project, current_user: global_admin).apply(:full_access?)).to be true
    end

    it "denies project admin (non-org-admin) full access" do
      expect(policy(project, current_user: project_admin_user).apply(:full_access?)).to be false
    end

    context "for a personal project" do
      let(:personal_owner) { create(:user) }
      let(:personal_project) { create(:project, :personal, owner: personal_owner) }

      it "grants the personal project owner full access" do
        expect(policy(personal_project, current_user: personal_owner).apply(:full_access?)).to be true
      end
    end
  end

  describe "relation_scope" do
    let(:other_project) { create(:project, organization: organization) }
    let(:unrelated_project) { create(:project) }

    let!(:log_in_project) { create(:project_audit_log, project: project) }
    let!(:log_in_other_project) { create(:project_audit_log, project: other_project) }
    let!(:log_unrelated) { create(:project_audit_log, project: unrelated_project) }

    def scoped(current_user)
      policy = described_class.new(ProjectAuditLog, user: current_user, organization: organization)
      policy.apply_scope(ProjectAuditLog.all, type: :active_record_relation)
    end

    it "returns all project logs for global admin" do
      result = scoped(global_admin)
      expect(result).to include(log_in_project, log_in_other_project, log_unrelated)
    end

    it "returns all org projects' logs for org admin" do
      result = scoped(org_admin)
      expect(result).to include(log_in_project, log_in_other_project)
      expect(result).not_to include(log_unrelated)
    end

    it "returns only administered project logs for project admin" do
      result = scoped(project_admin_user)
      expect(result).to include(log_in_project)
      expect(result).not_to include(log_in_other_project, log_unrelated)
    end

    it "returns nothing for project member" do
      result = scoped(project_member_user)
      expect(result).to be_empty
    end

    context "with a personal project" do
      let(:personal_owner) { create(:user) }
      let(:personal_project) { create(:project, :personal, owner: personal_owner) }
      let!(:personal_log) { create(:project_audit_log, project: personal_project) }

      it "includes personal project logs for the owner" do
        result = scoped(personal_owner)
        expect(result).to include(personal_log)
      end

      it "excludes personal project logs for unrelated users" do
        result = scoped(project_member_user)
        expect(result).not_to include(personal_log)
      end
    end
  end
end
