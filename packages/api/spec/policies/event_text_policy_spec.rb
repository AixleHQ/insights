# frozen_string_literal: true

require 'rails_helper'

RSpec.describe EventTextPolicy do
  let(:user) { create(:user) }
  let(:admin_user) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:tool_event) { create(:tool_event, organization: organization, user: user) }

  def policy(record, user:, organization: nil)
    described_class.new(record, user: user, organization: organization)
  end

  describe '#show?' do
    context 'organization owner' do
      before { create(:organization_membership, user: user, organization: organization, role: 'owner') }

      it 'allows reading event text' do
        expect(policy(tool_event, user: user, organization: organization)).to be_show
      end
    end

    context 'organization member' do
      before { create(:organization_membership, user: user, organization: organization, role: 'member') }

      it 'denies reading event text' do
        expect(policy(tool_event, user: user, organization: organization)).not_to be_show
      end
    end

    context 'global admin' do
      it 'allows reading event text for any event' do
        expect(policy(tool_event, user: admin_user, organization: organization)).to be_show
      end
    end

    context 'non-member' do
      let(:non_member) { create(:user) }

      it 'denies reading event text' do
        expect(policy(tool_event, user: non_member, organization: organization)).not_to be_show
      end
    end

    context 'when organization is resolved from the record' do
      before { create(:organization_membership, user: user, organization: organization, role: 'owner') }

      it 'allows the owner even without an explicit organization argument' do
        expect(policy(tool_event, user: user)).to be_show
      end
    end
  end
end
