# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ToolEventPolicy do
  let(:user) { create(:user) }
  let(:admin_user) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:tool_event) { create(:tool_event, organization: organization, user: user) }

  def policy(record, user:, organization: nil)
    described_class.new(record, user: user, organization: organization)
  end

  describe 'organization member' do
    before { create(:organization_membership, user: user, organization: organization, role: 'member') }

    it 'allows index access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_index
    end

    it 'allows show access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_show
    end

    it 'allows create access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_create
    end

    it 'denies update access' do
      expect(policy(tool_event, user: user, organization: organization)).not_to be_update
    end

    it 'denies destroy access' do
      expect(policy(tool_event, user: user, organization: organization)).not_to be_destroy
    end
  end

  describe 'organization admin' do
    before { create(:organization_membership, user: user, organization: organization, role: 'admin') }

    it 'allows index access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_index
    end

    it 'allows show access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_show
    end

    it 'allows create access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_create
    end

    it 'allows update access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_update
    end

    it 'allows destroy access' do
      expect(policy(tool_event, user: user, organization: organization)).to be_destroy
    end
  end

  describe 'global admin' do
    it 'allows index access to any event' do
      expect(policy(tool_event, user: admin_user)).to be_index
    end

    it 'allows show access to any event' do
      expect(policy(tool_event, user: admin_user)).to be_show
    end

    it 'allows create access to any event' do
      expect(policy(tool_event, user: admin_user)).to be_create
    end

    it 'allows update access to any event' do
      expect(policy(tool_event, user: admin_user)).to be_update
    end

    it 'allows destroy access to any event' do
      expect(policy(tool_event, user: admin_user)).to be_destroy
    end
  end

  describe 'non-member' do
    let(:non_member) { create(:user) }

    it 'denies index access' do
      expect(policy(tool_event, user: non_member, organization: organization)).not_to be_index
    end

    it 'denies show access' do
      expect(policy(tool_event, user: non_member, organization: organization)).not_to be_show
    end

    it 'denies create access' do
      expect(policy(tool_event, user: non_member, organization: organization)).not_to be_create
    end

    it 'denies update access' do
      expect(policy(tool_event, user: non_member, organization: organization)).not_to be_update
    end

    it 'denies destroy access' do
      expect(policy(tool_event, user: non_member, organization: organization)).not_to be_destroy
    end
  end

  describe 'relation_scope' do
    let(:other_org) { create(:organization) }
    let(:other_event) { create(:tool_event, organization: other_org) }

    before do
      create(:organization_membership, user: user, organization: organization, role: 'member')
    end

    it 'scopes events to user organizations' do
      p = policy(tool_event, user: user, organization: organization)
      scope = p.apply_scope(ToolEvent.all, type: :active_record_relation)

      expect(scope).to include(tool_event)
      expect(scope).not_to include(other_event)
    end

    it 'returns all events for global admin' do
      p = policy(tool_event, user: admin_user, organization: organization)
      scope = p.apply_scope(ToolEvent.all, type: :active_record_relation)

      expect(scope).to include(tool_event)
      expect(scope).to include(other_event)
    end
  end
end
