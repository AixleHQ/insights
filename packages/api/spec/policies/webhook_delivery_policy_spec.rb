# frozen_string_literal: true

require "rails_helper"

RSpec.describe WebhookDeliveryPolicy, type: :policy do
  let(:organization) { create(:organization) }
  let(:owner)        { create(:user) }
  let(:admin)        { create(:user) }
  let(:member)       { create(:user) }
  let(:viewer)       { create(:user) }
  let(:non_member)   { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }

  let(:connector) { create(:organization_connector, organization: organization) }
  let(:delivery)  { create(:webhook_delivery, :failed, organization_connector: connector) }

  before do
    create(:organization_membership, user: owner,  organization: organization, role: "owner")
    create(:organization_membership, user: admin,  organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: "member")
    create(:organization_membership, user: viewer, organization: organization, role: "viewer")
  end

  def policy_for(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe "#index? (record = Organization)" do
    it "allows org owner" do
      expect(policy_for(organization, current_user: owner).apply(:index?)).to be true
    end

    it "allows org admin" do
      expect(policy_for(organization, current_user: admin).apply(:index?)).to be true
    end

    it "denies org member" do
      expect(policy_for(organization, current_user: member).apply(:index?)).to be false
    end

    it "denies viewer" do
      expect(policy_for(organization, current_user: viewer).apply(:index?)).to be false
    end

    it "denies non-member" do
      expect(policy_for(organization, current_user: non_member).apply(:index?)).to be false
    end

    it "allows global admin" do
      expect(policy_for(organization, current_user: global_admin).apply(:index?)).to be true
    end
  end

  describe "#retry? (record = WebhookDelivery)" do
    it "allows org owner" do
      expect(policy_for(delivery, current_user: owner).apply(:retry?)).to be true
    end

    it "allows org admin" do
      expect(policy_for(delivery, current_user: admin).apply(:retry?)).to be true
    end

    it "denies org member" do
      expect(policy_for(delivery, current_user: member).apply(:retry?)).to be false
    end

    it "denies viewer" do
      expect(policy_for(delivery, current_user: viewer).apply(:retry?)).to be false
    end

    it "denies non-member" do
      expect(policy_for(delivery, current_user: non_member).apply(:retry?)).to be false
    end

    it "allows global admin" do
      expect(policy_for(delivery, current_user: global_admin).apply(:retry?)).to be true
    end
  end

  describe "relation_scope" do
    let(:other_org)       { create(:organization) }
    let(:other_connector) { create(:organization_connector, organization: other_org) }
    let!(:delivery_in_org)       { create(:webhook_delivery, organization_connector: connector) }
    let!(:delivery_in_other_org) { create(:webhook_delivery, organization_connector: other_connector) }

    before do
      create(:organization_membership, user: admin, organization: other_org, role: "member")
    end

    def scoped(current_user)
      policy = described_class.new(WebhookDelivery, user: current_user, organization: organization)
      policy.apply_scope(WebhookDelivery.all, type: :active_record_relation)
    end

    it "returns all deliveries for global admin" do
      result = scoped(global_admin)
      expect(result).to include(delivery_in_org, delivery_in_other_org)
    end

    it "scopes to orgs where user is admin" do
      result = scoped(admin)
      expect(result).to include(delivery_in_org)
      expect(result).not_to include(delivery_in_other_org)
    end

    it "returns nothing for a member" do
      result = scoped(member)
      expect(result).to be_empty
    end

    it "returns nothing for nil user" do
      policy = described_class.new(WebhookDelivery, user: nil, organization: organization)
      result = policy.apply_scope(WebhookDelivery.all, type: :active_record_relation)
      expect(result).to be_empty
    end
  end
end
