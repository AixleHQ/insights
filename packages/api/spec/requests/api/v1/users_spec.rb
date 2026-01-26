# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Users', type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  describe 'GET /api/v1/users/me' do
    it 'returns the current user' do
      authenticated_get '/api/v1/users/me', user: user

      expect_success
      expect(json_data[:id]).to eq(user.id)
      expect(json_data[:email]).to eq(user.email)
    end

    it 'returns unauthorized without authentication' do
      get '/api/v1/users/me'

      expect_unauthorized
    end
  end

  describe 'PATCH /api/v1/users/me' do
    it 'updates the current user' do
      authenticated_patch '/api/v1/users/me', user: user, params: { name: 'New Name' }

      expect_success
      expect(json_data[:name]).to eq('New Name')
      expect(user.reload.name).to eq('New Name')
    end

    it 'does not allow updating email directly' do
      old_email = user.email
      authenticated_patch '/api/v1/users/me', user: user, params: { email: 'new@example.com' }

      expect_success
      expect(user.reload.email).to eq(old_email)
    end
  end

  describe 'GET /api/v1/users/me/organizations' do
    let!(:organization) { create(:organization) }
    let!(:membership) { create(:organization_membership, user: user, organization: organization) }

    it 'returns the user organizations' do
      authenticated_get '/api/v1/users/me/organizations', user: user

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:id]).to eq(organization.id)
    end
  end

  describe 'GET /api/v1/users/me/settings' do
    let!(:setting) { create(:user_setting, user: user, key: 'theme', value: 'dark') }

    it 'returns user settings' do
      authenticated_get '/api/v1/users/me/settings', user: user

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:key]).to eq('theme')
      expect(json_data.first[:value]).to eq('dark')
    end
  end

  describe 'PUT /api/v1/users/me/settings/:key' do
    it 'creates a new setting' do
      authenticated_put '/api/v1/users/me/settings/theme', user: user, params: { value: 'light' }

      expect_success
      expect(json_data[:key]).to eq('theme')
      expect(json_data[:value]).to eq('light')
    end

    it 'updates an existing setting' do
      create(:user_setting, user: user, key: 'theme', value: 'dark')

      authenticated_put '/api/v1/users/me/settings/theme', user: user, params: { value: 'light' }

      expect_success
      expect(json_data[:value]).to eq('light')
    end
  end

  describe 'DELETE /api/v1/users/me/settings/:key' do
    let!(:setting) { create(:user_setting, user: user, key: 'theme', value: 'dark') }

    it 'deletes the setting' do
      authenticated_delete '/api/v1/users/me/settings/theme', user: user

      expect_no_content
      expect(user.user_settings.find_by(key: 'theme')).to be_nil
    end

    it 'returns 404 for non-existent setting' do
      authenticated_delete '/api/v1/users/me/settings/nonexistent', user: user

      expect_not_found
    end
  end
end
