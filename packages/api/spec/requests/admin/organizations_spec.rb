# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Organizations', type: :request do
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }

  before do
    allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)
  end

  describe 'GET /admin/organizations' do
    it 'lists all organizations' do
      create_list(:organization, 3)

      get admin_organizations_path

      expect(response).to have_http_status(:ok)
      expect(response.body).to include('Organizations')
    end
  end

  describe 'GET /admin/organizations/:id' do
    it 'shows organization details' do
      get admin_organization_path(organization)

      expect(response).to have_http_status(:ok)
      expect(response.body).to include(organization.name)
    end
  end

  describe 'POST /admin/organizations' do
    it 'creates a new organization' do
      expect {
        post admin_organizations_path, params: { organization: { name: 'New Org', slug: 'new-org' } }
      }.to change(Organization, :count).by(1)

      new_org = Organization.find_by(slug: 'new-org')
      expect(response).to redirect_to(admin_organization_path(new_org))
      expect(new_org.name).to eq('New Org')
    end
  end

  describe 'PATCH /admin/organizations/:id' do
    it 'updates organization attributes' do
      patch admin_organization_path(organization), params: { organization: { name: 'Updated Name' } }

      expect(response).to redirect_to(admin_organization_path(organization))
      expect(organization.reload.name).to eq('Updated Name')
    end
  end

  describe 'DELETE /admin/organizations/:id' do
    it 'destroys the organization' do
      org_id = organization.id

      delete admin_organization_path(organization)

      expect(response).to redirect_to(admin_organizations_path)
      expect(Organization.find_by(id: org_id)).to be_nil
    end
  end

  describe 'GET /admin/organizations/export' do
    it 'exports organizations as CSV' do
      create_list(:organization, 3)

      get export_admin_organizations_path(format: :csv)

      expect(response).to have_http_status(:ok)
      expect(response.content_type).to include('text/csv')
    end
  end

  describe 'POST /admin/organizations/batch_delete' do
    it 'deletes multiple organizations' do
      orgs = create_list(:organization, 3)
      ids = orgs.map(&:id)

      post batch_delete_admin_organizations_path, params: { ids: ids }

      expect(response).to redirect_to(admin_organizations_path)
      ids.each do |id|
        expect(Organization.find_by(id: id)).to be_nil
      end
    end

    it 'creates an AdminAuditLog entry for each deleted organization' do
      orgs = create_list(:organization, 3)
      ids  = orgs.map(&:id)

      expect {
        post batch_delete_admin_organizations_path, params: { ids: ids }
      }.to change(AdminAuditLog, :count).by(3)

      logs = AdminAuditLog.order(:created_at).last(3)
      expect(logs.map(&:action)).to all(eq('batch_delete'))
      expect(logs.map(&:resource_type)).to all(eq('Organization'))
      expect(logs.first.tracked_changes).to include('name', 'slug')
    end
  end

  describe 'audit logging' do
    it 'logs create actions' do
      expect {
        post admin_organizations_path, params: { organization: { name: 'Audit Test', slug: 'audit-test' } }
      }.to change(AdminAuditLog, :count).by(1)

      log = AdminAuditLog.last
      expect(log.action).to eq('create')
      expect(log.resource_type).to eq('Organization')
    end

    it 'logs update actions' do
      expect {
        patch admin_organization_path(organization), params: { organization: { name: 'Updated' } }
      }.to change(AdminAuditLog, :count).by(1)

      log = AdminAuditLog.last
      expect(log.action).to eq('update')
      expect(log.resource_id).to eq(organization.id.to_s)
    end

    it 'logs destroy actions' do
      org_id = organization.id

      expect {
        delete admin_organization_path(organization)
      }.to change(AdminAuditLog, :count).by(1)

      log = AdminAuditLog.last
      expect(log.action).to eq('destroy')
      expect(log.resource_id).to eq(org_id.to_s)
    end
  end
end
