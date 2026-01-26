# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Users', type: :request do
  let(:global_admin) { create(:user, :global_admin) }
  let(:user) { create(:user) }

  before do
    allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)
  end

  describe 'GET /admin/users' do
    it 'lists all users' do
      create_list(:user, 3)

      get admin_users_path

      expect(response).to have_http_status(:ok)
      expect(response.body).to include('Users')
    end
  end

  describe 'GET /admin/users/:id' do
    it 'shows user details' do
      get admin_user_path(user)

      expect(response).to have_http_status(:ok)
      expect(response.body).to include(user.email)
    end
  end

  describe 'PATCH /admin/users/:id' do
    it 'updates user attributes' do
      patch admin_user_path(user), params: { user: { name: 'Updated Name' } }

      expect(response).to redirect_to(admin_user_path(user))
      expect(user.reload.name).to eq('Updated Name')
    end
  end

  describe 'POST /admin/users/:id/impersonate' do
    it 'sets impersonation session and creates audit log' do
      expect {
        post impersonate_admin_user_path(user)
      }.to change(AdminAuditLog, :count).by(1)

      expect(response).to redirect_to(admin_root_path)
      expect(session[:impersonated_user_id]).to eq(user.id)

      audit_log = AdminAuditLog.last
      expect(audit_log.action).to eq('impersonate')
      expect(audit_log.resource_type).to eq('User')
      expect(audit_log.resource_id).to eq(user.id.to_s)
    end
  end

  describe 'GET /admin/users/export' do
    it 'exports users as CSV' do
      create_list(:user, 3)

      get export_admin_users_path(format: :csv)

      expect(response).to have_http_status(:ok)
      expect(response.content_type).to include('text/csv')
    end
  end
end
