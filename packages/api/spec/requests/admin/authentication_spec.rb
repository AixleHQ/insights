# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Authentication', type: :request do
  let(:regular_user) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }

  describe 'accessing admin panel' do
    it 'denies access to regular users' do
      # Simulate admin session
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(regular_user)

      get admin_root_path

      # In test/dev environment, redirects to login instead of 403
      expect(response).to redirect_to('/admin/login')
    end

    it 'allows access to global admins' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)

      get admin_root_path

      expect(response).to have_http_status(:ok)
    end

    it 'denies access to unauthenticated users' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(nil)

      get admin_root_path

      # In test/dev environment, redirects to login instead of 403
      expect(response).to redirect_to('/admin/login')
    end
  end

  describe 'admin resources' do
    before do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)
    end

    it 'allows listing users' do
      create_list(:user, 3)

      get admin_users_path

      expect(response).to have_http_status(:ok)
    end

    it 'allows listing organizations' do
      create_list(:organization, 3)

      get admin_organizations_path

      expect(response).to have_http_status(:ok)
    end

    it 'allows viewing audit logs' do
      get admin_audit_logs_path

      expect(response).to have_http_status(:ok)
    end

    it 'allows viewing admin audit logs' do
      get admin_admin_audit_logs_path

      expect(response).to have_http_status(:ok)
    end
  end
end
