# frozen_string_literal: true

require 'rails_helper'

RSpec.describe InvitationPolicy, type: :policy do
  let(:organization) { create(:organization) }
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: 'owner')
    create(:organization_membership, user: admin, organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: 'member')
  end

  let(:invitation) { create(:invitation, organization: organization, invited_by: admin) }

  describe '#index?' do
    it 'allows owners' do
      expect(described_class.new(invitation, user: owner, organization: organization)).to be_index
    end

    it 'allows admins' do
      expect(described_class.new(invitation, user: admin, organization: organization)).to be_index
    end

    it 'denies members' do
      expect(described_class.new(invitation, user: member, organization: organization)).not_to be_index
    end

    it 'allows global admins' do
      expect(described_class.new(invitation, user: global_admin, organization: organization)).to be_index
    end
  end

  describe '#show?' do
    it 'allows admins' do
      expect(described_class.new(invitation, user: admin, organization: organization)).to be_show
    end

    it 'denies members' do
      expect(described_class.new(invitation, user: member, organization: organization)).not_to be_show
    end
  end

  describe '#create?' do
    it 'allows owners' do
      expect(described_class.new(invitation, user: owner, organization: organization)).to be_create
    end

    it 'allows admins' do
      expect(described_class.new(invitation, user: admin, organization: organization)).to be_create
    end

    it 'denies members' do
      expect(described_class.new(invitation, user: member, organization: organization)).not_to be_create
    end
  end

  describe '#destroy?' do
    context 'with pending invitation' do
      it 'allows admins' do
        expect(described_class.new(invitation, user: admin, organization: organization)).to be_destroy
      end

      it 'denies members' do
        expect(described_class.new(invitation, user: member, organization: organization)).not_to be_destroy
      end
    end

    context 'with accepted invitation' do
      let(:accepted_invitation) { create(:invitation, :accepted, organization: organization, invited_by: admin) }

      it 'denies everyone' do
        expect(described_class.new(accepted_invitation, user: owner, organization: organization)).not_to be_destroy
      end
    end
  end

  describe '#resend?' do
    context 'with pending invitation' do
      it 'allows admins' do
        expect(described_class.new(invitation, user: admin, organization: organization)).to be_resend
      end

      it 'denies members' do
        expect(described_class.new(invitation, user: member, organization: organization)).not_to be_resend
      end
    end

    context 'with non-pending invitation' do
      let(:accepted_invitation) { create(:invitation, :accepted, organization: organization, invited_by: admin) }

      it 'denies everyone' do
        expect(described_class.new(accepted_invitation, user: owner, organization: organization)).not_to be_resend
      end
    end
  end
end
