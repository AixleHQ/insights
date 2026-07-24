# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::UserAvatars', type: :request do
  let(:user) { create(:user) }

  describe 'POST /api/v1/users/me/avatar' do
    let(:file) { fixture_file_upload(Rails.root.join('spec/fixtures/files/avatar.png'), 'image/png') }
    let(:invalid_file) { fixture_file_upload(Rails.root.join('spec/fixtures/files/avatar.png'), 'text/plain') }

    it 'uploads avatar and returns updated user' do
      authenticated_multipart_post '/api/v1/users/me/avatar', user: user, params: { file: file }

      expect_success
      expect(json_data[:id]).to eq(user.id)
      expect(json_data[:avatarUrl]).to be_present
      expect(json_data[:avatarUrl]).to include('/rails/active_storage/')
    end

    it 'returns 422 when file is missing' do
      authenticated_multipart_post '/api/v1/users/me/avatar', user: user, params: {}

      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'returns 422 when file content type is unsupported' do
      authenticated_multipart_post '/api/v1/users/me/avatar', user: user, params: { file: invalid_file }

      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'returns unauthorized without authentication' do
      post '/api/v1/users/me/avatar'

      expect_unauthorized
    end
  end

  describe 'DELETE /api/v1/users/me/avatar' do
    let(:file) { fixture_file_upload(Rails.root.join('spec/fixtures/files/avatar.png'), 'image/png') }

    it 'purges the attached file when a file was uploaded via API' do
      authenticated_multipart_post '/api/v1/users/me/avatar', user: user, params: { file: file }
      expect_success

      authenticated_delete '/api/v1/users/me/avatar', user: user

      expect_success
      expect(json_data[:avatarUrl]).to be_nil
      expect(user.reload.avatar_file.attached?).to be false
    end

    it 'does not clear avatar_url when only a URL avatar is set (no attached file)' do
      user.update!(avatar_url: 'https://example.com/avatar.png')

      authenticated_delete '/api/v1/users/me/avatar', user: user

      expect_success
      expect(json_data[:avatarUrl]).to eq('https://example.com/avatar.png')
      expect(user.reload.avatar_url).to eq('https://example.com/avatar.png')
    end

    it 'returns unauthorized without authentication' do
      delete '/api/v1/users/me/avatar'

      expect_unauthorized
    end
  end
end
