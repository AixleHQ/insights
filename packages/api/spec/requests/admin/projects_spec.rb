# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Projects', type: :request do
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }

  before do
    allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)
  end

  describe 'POST /admin/projects/batch_delete' do
    it 'deletes multiple projects' do
      projects = create_list(:project, 3, organization: organization)
      ids = projects.map(&:id)

      post batch_delete_admin_projects_path, params: { ids: ids }

      expect(response).to redirect_to(admin_projects_path)
      ids.each { |id| expect(Project.find_by(id: id)).to be_nil }
    end

    it 'creates an AdminAuditLog entry for each deleted project' do
      projects = create_list(:project, 2, organization: organization)
      ids = projects.map(&:id)

      expect {
        post batch_delete_admin_projects_path, params: { ids: ids }
      }.to change(AdminAuditLog, :count).by(2)

      logs = AdminAuditLog.order(:created_at).last(2)
      expect(logs.map(&:action)).to all(eq('batch_delete'))
      expect(logs.map(&:resource_type)).to all(eq('Project'))
      expect(logs.first.tracked_changes).to include('name', 'slug')
    end
  end
end
