require 'rails_helper'

RSpec.describe NotificationRoute, type: :model do
  let(:organization) { create(:organization) }
  let(:owner)        { create(:user) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
  end

  describe 'associations' do
    it { is_expected.to belong_to(:organization) }
    it { is_expected.to belong_to(:recipient_user).optional }
  end

  describe 'validations' do
    subject { build(:notification_route, organization: organization) }

    it { is_expected.to validate_inclusion_of(:notification_type).in_array(NotificationRoute::NOTIFICATION_TYPES) }
    it { is_expected.to validate_inclusion_of(:recipient_type).in_array(NotificationRoute::RECIPIENT_TYPES) }
  end

  describe 'exactly_one_recipient_target' do
    context 'when recipient_type is role' do
      it 'is valid with a recipient_role and no recipient_user_id' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "role", recipient_role: "owner", recipient_user_id: nil)
        expect(route).to be_valid
      end

      it 'is invalid without a recipient_role' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "role", recipient_role: nil)
        expect(route).not_to be_valid
        expect(route.errors[:recipient_role]).to include("must be present")
      end

      it 'is invalid with a recipient_user_id' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "role", recipient_role: "owner",
                      recipient_user_id: owner.id)
        expect(route).not_to be_valid
        expect(route.errors[:recipient_user_id]).to include("must be blank for role recipient")
      end

      it 'is invalid with an unrecognized role' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "role", recipient_role: "superadmin")
        expect(route).not_to be_valid
        expect(route.errors[:recipient_role]).to include("is not a valid role")
      end
    end

    context 'when recipient_type is user' do
      it 'is valid with a recipient_user who is an org member' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "user", recipient_role: nil,
                      recipient_user_id: owner.id)
        expect(route).to be_valid
      end

      it 'is invalid without a recipient_user_id' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "user", recipient_user_id: nil, recipient_role: nil)
        expect(route).not_to be_valid
        expect(route.errors[:recipient_user_id]).to include("must be present")
      end

      it 'is invalid with a recipient_role' do
        route = build(:notification_route, organization: organization,
                      recipient_type: "user", recipient_user_id: owner.id,
                      recipient_role: "owner")
        expect(route).not_to be_valid
        expect(route.errors[:recipient_role]).to include("must be blank for user recipient")
      end
    end
  end

  describe 'recipient_user_belongs_to_org' do
    it 'rejects a user who is not an org member' do
      outsider = create(:user)
      route = build(:notification_route, organization: organization,
                    recipient_type: "user", recipient_role: nil,
                    recipient_user_id: outsider.id)
      expect(route).not_to be_valid
      expect(route.errors[:recipient_user_id]).to include("must be a member of this organization")
    end
  end

  describe 'uniqueness (DB-level partial indexes)' do
    it 'prevents duplicate role-type routes with the same (org, notification_type, role)' do
      create(:notification_route, organization: organization,
             notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
      duplicate = build(:notification_route, organization: organization,
                        notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
      expect { duplicate.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it 'allows the same role for a different notification_type' do
      create(:notification_route, organization: organization,
             notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
      other = build(:notification_route, organization: organization,
                    notification_type: "token_alert", recipient_type: "role", recipient_role: "owner")
      expect(other).to be_valid
    end

    it 'prevents duplicate user-type routes with the same (org, notification_type, user)' do
      create(:notification_route, organization: organization,
             notification_type: "cost_alert", recipient_type: "user",
             recipient_role: nil, recipient_user_id: owner.id)
      duplicate = build(:notification_route, organization: organization,
                        notification_type: "cost_alert", recipient_type: "user",
                        recipient_role: nil, recipient_user_id: owner.id)
      expect { duplicate.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end

  describe 'schema' do
    it 'has the expected columns' do
      expect(described_class.column_names).to include(
        "id", "organization_id", "notification_type", "recipient_type",
        "recipient_role", "recipient_user_id", "enabled"
      )
    end
  end
end
