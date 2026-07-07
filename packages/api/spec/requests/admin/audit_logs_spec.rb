# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Audit Logs', type: :request do
  let(:global_admin) { create(:user, :global_admin) }

  before do
    allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)
  end

  describe 'GET /admin/audit_logs' do
    it 'lists audit logs without referencing a non-existent user association' do
      create_list(:audit_log, 3)

      get admin_audit_logs_path

      expect(response).to have_http_status(:ok)
    end
  end

  describe 'GET /admin/audit_logs/:id' do
    it 'shows audit log details' do
      audit_log = create(:audit_log)

      get admin_audit_log_path(audit_log)

      expect(response).to have_http_status(:ok)
      expect(response.body).to include(audit_log.raw_event_key)
    end

    it 'shows the acting user resolved through the tool event' do
      tool_event = create(:tool_event)
      audit_log = create(:audit_log, tool_event: tool_event)

      get admin_audit_log_path(audit_log)

      expect(response).to have_http_status(:ok)
      expect(response.body).to include(tool_event.user.display_name)
    end
  end

  describe 'GET /admin/audit_logs/export' do
    it 'exports audit logs as CSV using real columns' do
      create_list(:audit_log, 3)

      get export_admin_audit_logs_path(format: :csv)

      expect(response).to have_http_status(:ok)
      expect(response.content_type).to include('text/csv')
      expect(response.body).to include('raw_event_key,risk_level')
    end
  end
end
