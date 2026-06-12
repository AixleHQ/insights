# frozen_string_literal: true

require "rails_helper"

RSpec.describe OrganizationProviderSettingPolicy, type: :policy do
  let(:owner) { create(:user) }
  let(:member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
    create(:organization_membership, user: member, organization: organization, role: "member")
  end

  # The policy receives the Organization as the record (not the setting itself).
  def policy(current_user)
    described_class.new(organization, user: current_user, organization: organization)
  end

  describe "#index?" do
    it "allows org owners" do
      expect(policy(owner).apply(:index?)).to be true
    end

    it "allows org members (Eng Leads need to read the enabled list)" do
      expect(policy(member).apply(:index?)).to be true
    end

    it "denies non-members" do
      expect(policy(non_member).apply(:index?)).to be false
    end
  end

  describe "#update?" do
    it "allows org owners" do
      expect(policy(owner).apply(:update?)).to be true
    end

    it "denies org members" do
      expect(policy(member).apply(:update?)).to be false
    end

    it "denies non-members" do
      expect(policy(non_member).apply(:update?)).to be false
    end
  end
end
