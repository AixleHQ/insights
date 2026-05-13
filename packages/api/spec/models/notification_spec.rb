# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Notification, type: :model do
  describe 'associations' do
    it { is_expected.to belong_to(:user) }
    it { is_expected.to belong_to(:organization) }
  end

  describe 'validations' do
    describe 'notification_type' do
      it 'is valid for each known type' do
        Notification::NOTIFICATION_TYPES.each do |type|
          notification = build(:notification, notification_type: type)
          expect(notification).to be_valid, "expected #{type} to be valid"
        end
      end

      it 'is invalid for an unrecognized type' do
        notification = build(:notification, notification_type: 'unknown_type')
        expect(notification).not_to be_valid
        expect(notification.errors[:notification_type]).to be_present
      end
    end

    describe 'payload' do
      it 'is valid with an empty hash' do
        # presence: true would reject {}; exclusion: { in: [nil] } accepts it
        notification = build(:notification, payload: {})
        expect(notification).to be_valid
      end

      it 'is invalid when nil' do
        notification = build(:notification, payload: nil)
        expect(notification).not_to be_valid
        expect(notification.errors[:payload]).to be_present
      end
    end
  end

  describe '.unread scope' do
    let(:user)         { create(:user) }
    let(:organization) { create(:organization) }

    it 'returns notifications with no read_at' do
      unread = create(:notification, user: user, organization: organization, read_at: nil)
      _read  = create(:notification, user: user, organization: organization, read_at: Time.current)

      expect(described_class.unread).to contain_exactly(unread)
    end
  end
end
