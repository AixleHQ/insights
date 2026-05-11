# frozen_string_literal: true

require "rails_helper"

RSpec.describe OrganizationAuditLogPolicy, type: :policy do
  let(:organization) { create(:organization) }
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:viewer) { create(:user) }
  let(:non_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
    create(:organization_membership, user: admin, organization: organization, role: "owner")
    create(:organization_membership, user: member, organization: organization, role: "member")
    create(:organization_membership, user: viewer, organization: organization, role: "viewer")
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe "#index?" do
    it "allows org owner" do
      expect(policy(organization, current_user: owner).apply(:index?)).to be true
    end

    it "allows org admin" do
      expect(policy(organization, current_user: admin).apply(:index?)).to be true
    end

    it "denies org member" do
      expect(policy(organization, current_user: member).apply(:index?)).to be false
    end

    it "denies viewer" do
      expect(policy(organization, current_user: viewer).apply(:index?)).to be false
    end

    it "denies non-member" do
      expect(policy(organization, current_user: non_member).apply(:index?)).to be false
    end

    it "allows global admin" do
      expect(policy(organization, current_user: global_admin).apply(:index?)).to be true
    end
  end

  describe "#show?" do
    it "mirrors index? — allows admin" do
      expect(policy(organization, current_user: admin).apply(:show?)).to be true
    end

    it "mirrors index? — denies member" do
      expect(policy(organization, current_user: member).apply(:show?)).to be false
    end
  end

  describe "relation_scope" do
    let(:other_org) { create(:organization) }

    before do
      create(:organization_membership, user: admin, organization: other_org, role: "member")
    end

    let!(:log_in_org) { create(:organization_audit_log, organization: organization) }
    let!(:log_in_other_org) { create(:organization_audit_log, organization: other_org) }

    def scoped(current_user)
      policy = described_class.new(OrganizationAuditLog, user: current_user, organization: organization)
      policy.apply_scope(OrganizationAuditLog.all, type: :active_record_relation)
    end

    it "returns all logs for global admin" do
      result = scoped(global_admin)
      expect(result).to include(log_in_org, log_in_other_org)
    end

    it "scopes to orgs where user is admin" do
      result = scoped(admin)
      expect(result).to include(log_in_org)
      expect(result).not_to include(log_in_other_org)
    end

    it "returns nothing for member" do
      result = scoped(member)
      expect(result).to be_empty
    end
  end
end
