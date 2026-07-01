require 'rails_helper'

RSpec.describe Invitation, type: :model do
  describe 'constants' do
    it 'defines valid statuses' do
      expect(Invitation::STATUSES).to eq(%w[pending accepted revoked expired])
    end

    it 'defines roles from OrganizationMembership' do
      expect(Invitation::ROLES).to eq(OrganizationMembership::ROLES)
    end
  end

  describe 'associations' do
    it { should belong_to(:organization) }
    it { should belong_to(:invited_by).class_name('User') }
  end

  describe 'validations' do
    subject { build(:invitation) }

    it { should validate_presence_of(:email) }
    # Token is auto-generated before validation, so we test it differently
    it { should validate_presence_of(:role) }
    it { should validate_presence_of(:status) }
    it { should validate_inclusion_of(:role).in_array(Invitation::ROLES) }
    it { should validate_inclusion_of(:status).in_array(Invitation::STATUSES) }

    it 'validates email format' do
      invitation = build(:invitation, email: 'invalid-email')
      expect(invitation).not_to be_valid
      expect(invitation.errors[:email]).to be_present
    end

    it 'validates email uniqueness per organization for pending invitations' do
      existing = create(:invitation)
      duplicate = build(:invitation, organization: existing.organization, email: existing.email)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:email]).to include('has already been invited to this organization')
    end

    it 'allows same email if previous invitation is not pending' do
      existing = create(:invitation, :accepted)
      new_invitation = build(:invitation, organization: existing.organization, email: existing.email)
      expect(new_invitation).to be_valid
    end

    it 'validates token uniqueness' do
      existing = create(:invitation)
      duplicate = build(:invitation, token: existing.token)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:token]).to include('has already been taken')
    end
  end

  describe 'callbacks' do
    describe 'token generation' do
      it 'generates a token before validation on create' do
        invitation = build(:invitation, token: nil)
        expect(invitation.token).to be_nil
        invitation.valid?
        expect(invitation.token).to be_present
      end

      it 'does not override existing token' do
        invitation = build(:invitation, token: 'custom-token')
        invitation.valid?
        expect(invitation.token).to eq('custom-token')
      end
    end

    describe 'expiration setting' do
      it 'sets expires_at to 7 days from now on create' do
        invitation = build(:invitation, expires_at: nil)
        expect(invitation.expires_at).to be_nil
        invitation.valid?
        expect(invitation.expires_at).to be_within(1.second).of(7.days.from_now)
      end

      it 'does not override existing expires_at' do
        custom_expiry = 3.days.from_now
        invitation = build(:invitation, expires_at: custom_expiry)
        invitation.valid?
        expect(invitation.expires_at).to be_within(1.second).of(custom_expiry)
      end
    end
  end

  describe 'scopes' do
    let!(:pending_invitation) { create(:invitation, status: 'pending') }
    let!(:accepted_invitation) { create(:invitation, :accepted) }
    let!(:revoked_invitation) { create(:invitation, :revoked) }
    let!(:expired_invitation) { create(:invitation, status: 'expired') }

    describe '.pending' do
      it 'returns only pending invitations' do
        expect(Invitation.pending).to contain_exactly(pending_invitation)
      end
    end

    describe '.accepted' do
      it 'returns only accepted invitations' do
        expect(Invitation.accepted).to contain_exactly(accepted_invitation)
      end
    end

    describe '.revoked' do
      it 'returns only revoked invitations' do
        expect(Invitation.revoked).to contain_exactly(revoked_invitation)
      end
    end

    describe '.expired' do
      it 'returns only expired invitations' do
        expect(Invitation.expired).to contain_exactly(expired_invitation)
      end
    end

    describe '.active' do
      it 'returns pending invitations that have not expired' do
        active = create(:invitation, status: 'pending', expires_at: 1.day.from_now)
        inactive = create(:invitation, status: 'pending', expires_at: 1.day.ago)

        expect(Invitation.active).to contain_exactly(pending_invitation, active)
      end
    end
  end

  describe 'status predicates' do
    describe '#pending?' do
      it 'returns true for pending status' do
        invitation = build(:invitation, status: 'pending')
        expect(invitation.pending?).to be true
      end

      it 'returns false for other statuses' do
        invitation = build(:invitation, :accepted)
        expect(invitation.pending?).to be false
      end
    end

    describe '#accepted?' do
      it 'returns true for accepted status' do
        invitation = build(:invitation, :accepted)
        expect(invitation.accepted?).to be true
      end
    end

    describe '#revoked?' do
      it 'returns true for revoked status' do
        invitation = build(:invitation, :revoked)
        expect(invitation.revoked?).to be true
      end
    end

    describe '#expired?' do
      it 'returns true if status is expired' do
        invitation = build(:invitation, status: 'expired')
        expect(invitation.expired?).to be true
      end

      it 'returns true if pending and past expiration date' do
        invitation = build(:invitation, status: 'pending', expires_at: 1.day.ago)
        expect(invitation.expired?).to be true
      end

      it 'returns false if pending and not past expiration' do
        invitation = build(:invitation, status: 'pending', expires_at: 1.day.from_now)
        expect(invitation.expired?).to be false
      end
    end

    describe '#active?' do
      it 'returns true for pending non-expired invitations' do
        invitation = build(:invitation, status: 'pending', expires_at: 1.day.from_now)
        expect(invitation.active?).to be true
      end

      it 'returns false for expired invitations' do
        invitation = build(:invitation, status: 'pending', expires_at: 1.day.ago)
        expect(invitation.active?).to be false
      end

      it 'returns false for non-pending invitations' do
        invitation = build(:invitation, :accepted)
        expect(invitation.active?).to be false
      end
    end
  end

  describe '#accept!' do
    let(:organization) { create(:organization) }
    let(:invitation) { create(:invitation, organization: organization, role: 'member') }
    let(:user) { create(:user) }

    it 'creates a membership for the user' do
      membership = invitation.accept!(user)

      expect(membership).to be_persisted
      expect(membership.user).to eq(user)
      expect(membership.organization).to eq(organization)
      expect(membership.role).to eq('member')
    end

    it 'updates invitation status to accepted' do
      invitation.accept!(user)

      expect(invitation.reload.status).to eq('accepted')
      expect(invitation.accepted_at).to be_present
    end

    it 'returns false if invitation is not active' do
      invitation.update!(status: 'revoked')

      result = invitation.accept!(user)

      expect(result).to be false
      expect(user.organizations).not_to include(organization)
    end

    it 'is idempotent when the user is already a member' do
      existing = create(:organization_membership, user: user, organization: organization)

      result = invitation.accept!(user)

      expect(result).to eq(existing)
      expect(organization.organization_memberships.where(user: user).count).to eq(1)
      expect(invitation.reload.status).to eq('accepted')
      expect(invitation.accepted_at).to be_present
    end

    it 'assigns the correct role from the invitation' do
      viewer_invitation = create(:invitation, :viewer, organization: organization)

      membership = viewer_invitation.accept!(user)

      expect(membership.role).to eq('viewer')
    end
  end

  describe '#revoke!' do
    it 'updates status to revoked for pending invitations' do
      invitation = create(:invitation)

      result = invitation.revoke!

      expect(result).to be true
      expect(invitation.reload.status).to eq('revoked')
    end

    it 'returns false for non-pending invitations' do
      invitation = create(:invitation, :accepted)

      result = invitation.revoke!

      expect(result).to be false
      expect(invitation.reload.status).to eq('accepted')
    end
  end

  describe '#mark_expired!' do
    it 'updates status to expired for pending invitations' do
      invitation = create(:invitation)

      result = invitation.mark_expired!

      expect(result).to be true
      expect(invitation.reload.status).to eq('expired')
    end

    it 'returns false for non-pending invitations' do
      invitation = create(:invitation, :accepted)

      result = invitation.mark_expired!

      expect(result).to be false
    end
  end

  describe '#accept_url' do
    it 'returns the frontend URL with token' do
      invitation = build(:invitation, token: 'test-token-123')

      expect(invitation.accept_url).to include('/invitations/test-token-123')
    end
  end
end
