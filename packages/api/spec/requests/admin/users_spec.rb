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
    it 'creates audit log and redirects to frontend with impersonation token' do
      expect {
        post impersonate_admin_user_path(user)
      }.to change(AdminAuditLog, :count).by(1)

      expect(response).to have_http_status(:redirect)
      expect(response.location).to start_with(ENV.fetch('FRONTEND_URL', 'http://localhost:5173'))
      expect(response.location).to include('impersonate=')

      audit_log = AdminAuditLog.last
      expect(audit_log.action).to eq('impersonate')
      expect(audit_log.resource_type).to eq('User')
      expect(audit_log.resource_id).to eq(user.id.to_s)
    end

    context 'when the impersonated user belongs to organizations' do
      let(:organization) { create(:organization) }

      before do
        create(:organization_membership, user: user, organization: organization)
      end

      it 'logs impersonation.started to each organization audit log' do
        expect {
          post impersonate_admin_user_path(user)
        }.to change(OrganizationAuditLog, :count).by(1)

        org_log = OrganizationAuditLog.last
        expect(org_log.action).to eq('impersonation.started')
        expect(org_log.organization).to eq(organization)
        expect(org_log.actor).to eq(global_admin)
        expect(org_log.resource_type).to eq('User')
        expect(org_log.resource_id).to eq(user.id.to_s)
        expect(org_log.metadata['impersonator_email']).to eq(global_admin.email)
      end
    end

    context 'when the impersonated user belongs to multiple organizations' do
      let(:org1) { create(:organization) }
      let(:org2) { create(:organization) }

      before do
        create(:organization_membership, user: user, organization: org1)
        create(:organization_membership, user: user, organization: org2)
      end

      it 'logs impersonation.started to every organization' do
        expect {
          post impersonate_admin_user_path(user)
        }.to change(OrganizationAuditLog, :count).by(2)

        actions = OrganizationAuditLog.last(2).map(&:action)
        expect(actions).to all(eq('impersonation.started'))
      end
    end

    context 'when the impersonated user belongs to no organizations' do
      it 'does not create any organization audit log' do
        expect {
          post impersonate_admin_user_path(user)
        }.not_to change(OrganizationAuditLog, :count)
      end
    end

    context 'when the impersonated user belongs to projects' do
      let(:organization) { create(:organization) }
      let(:project) { create(:project, organization: organization) }

      before do
        create(:organization_membership, user: user, organization: organization)
        create(:project_membership, user: user, project: project, role: 'member')
      end

      it 'logs impersonation.started to each project audit log' do
        expect {
          post impersonate_admin_user_path(user)
        }.to change(ProjectAuditLog, :count).by(1)

        log = ProjectAuditLog.last
        expect(log.action).to eq('impersonation.started')
        expect(log.project).to eq(project)
        expect(log.actor).to eq(global_admin)
        expect(log.resource_type).to eq('User')
        expect(log.resource_id).to eq(user.id)
        expect(log.metadata['impersonator_email']).to eq(global_admin.email)
      end
    end

    context 'when the impersonated user belongs to multiple projects' do
      let(:organization) { create(:organization) }
      let(:project1) { create(:project, organization: organization) }
      let(:project2) { create(:project, organization: organization) }

      before do
        create(:organization_membership, user: user, organization: organization)
        create(:project_membership, user: user, project: project1, role: 'member')
        create(:project_membership, user: user, project: project2, role: 'member')
      end

      it 'logs impersonation.started to every project' do
        expect {
          post impersonate_admin_user_path(user)
        }.to change(ProjectAuditLog, :count).by(2)

        actions = ProjectAuditLog.last(2).map(&:action)
        expect(actions).to all(eq('impersonation.started'))
      end
    end

    context 'when the impersonated user belongs to no projects' do
      it 'does not create any project audit log' do
        expect {
          post impersonate_admin_user_path(user)
        }.not_to change(ProjectAuditLog, :count)
      end
    end
  end

  describe 'DELETE /admin/users/:id' do
    it 'destroys the user' do
      user_id = user.id

      delete admin_user_path(user)

      expect(response).to redirect_to(admin_users_path)
      expect(User.find_by(id: user_id)).to be_nil
    end

    context 'when the user is assigned to a Jira-synced issue' do
      it 'nullifies the assignee instead of raising a foreign key violation' do
        issue = create(:issue, :with_assignee, assignee: user)

        delete admin_user_path(user)

        expect(response).to redirect_to(admin_users_path)
        expect(User.find_by(id: user.id)).to be_nil
        expect(issue.reload.assignee_id).to be_nil
      end
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
