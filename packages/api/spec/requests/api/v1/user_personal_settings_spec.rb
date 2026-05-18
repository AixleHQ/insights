# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::UserPersonalSettings', type: :request do
  let(:user) { create(:user) }

  describe 'GET /api/v1/users/me/personal_settings' do
    context 'when no settings row exists' do
      it 'returns 200 with nil thresholds' do
        authenticated_get '/api/v1/users/me/personal_settings', user: user

        expect_success
        expect(json_data[:costThresholdCents]).to be_nil
        expect(json_data[:tokenThreshold]).to be_nil
      end
    end

    context 'when a settings row exists' do
      before do
        create(:user_personal_settings, user: user, cost_threshold_cents: 500, token_threshold: 100_000)
      end

      it 'returns persisted thresholds' do
        authenticated_get '/api/v1/users/me/personal_settings', user: user

        expect_success
        expect(json_data[:costThresholdCents]).to eq(500)
        expect(json_data[:tokenThreshold]).to eq(100_000)
      end
    end

    context 'when another user has settings' do
      let(:other_user) { create(:user) }

      before do
        create(:user_personal_settings, user: other_user, cost_threshold_cents: 9999)
      end

      it 'returns only the current user data (nil thresholds)' do
        authenticated_get '/api/v1/users/me/personal_settings', user: user

        expect_success
        expect(json_data[:costThresholdCents]).to be_nil
      end
    end
  end

  describe 'PATCH /api/v1/users/me/personal_settings' do
    it 'creates a settings row on first update' do
      authenticated_patch '/api/v1/users/me/personal_settings',
                          user: user,
                          params: { personal_settings: { cost_threshold_cents: 1000, token_threshold: 50_000 } }

      expect_success
      expect(json_data[:costThresholdCents]).to eq(1000)
      expect(json_data[:tokenThreshold]).to eq(50_000)
      expect(user.reload.personal_setting.cost_threshold_cents).to eq(1000)
    end

    it 'updates an existing settings row' do
      create(:user_personal_settings, user: user, cost_threshold_cents: 500)

      authenticated_patch '/api/v1/users/me/personal_settings',
                          user: user,
                          params: { personal_settings: { cost_threshold_cents: 2000 } }

      expect_success
      expect(json_data[:costThresholdCents]).to eq(2000)
    end

    it 'updates alert_email and alert_slack flags' do
      authenticated_patch '/api/v1/users/me/personal_settings',
                          user: user,
                          params: { personal_settings: { alert_email: true, alert_slack: false } }

      expect_success
      expect(json_data[:alertEmail]).to be true
      expect(json_data[:alertSlack]).to be false
    end

    it 'returns 400 when personal_settings param is missing' do
      authenticated_patch '/api/v1/users/me/personal_settings',
                          user: user,
                          params: { cost_threshold_cents: 100 }

      expect(response).to have_http_status(:bad_request)
    end
  end
end
