# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::OrganizationAuditLogs", type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:viewer) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
    create(:organization_membership, user: admin, organization: organization, role: "admin")
    create(:organization_membership, user: member, organization: organization, role: "member")
    create(:organization_membership, user: viewer, organization: organization, role: "viewer")
    create(:organization_membership, user: global_admin, organization: organization, role: "member")
  end

  describe "GET /api/v1/organizations/:organization_id/audit_logs" do
    let!(:log1) { create(:organization_audit_log, organization: organization, actor: admin, action: "connector.create") }
    let!(:log2) { create(:organization_audit_log, :settings_update, organization: organization, actor: owner) }
    let!(:log3) { create(:organization_audit_log, :member_role_changed, organization: organization, actor: admin) }

    context "when authenticated as owner" do
      it "returns paginated audit logs" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "includes actor details" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:action] == "connector.create" }
        expect(log[:actor]).to include(id: admin.id, email: admin.email)
      end

      it "includes tracked_changes" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:action] == "settings.update" }
        expect(log[:trackedChanges]).to have_key(:key)
      end

      it "includes ip_address" do
        log_with_ip = create(:organization_audit_log, organization: organization, actor: admin,
                                                      action: "connector.delete", ip_address: "1.2.3.4")

        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:id] == log_with_ip.id }
        expect(log).to have_key(:ipAddress)
      end

      it "returns logs ordered by created_at desc" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization

        expect_success
        timestamps = json_data.map { |l| l[:createdAt] }
        expect(timestamps).to eq(timestamps.sort.reverse)
      end
    end

    context "when authenticated as admin" do
      it "returns audit logs" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: admin,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(3)
      end
    end

    context "when authenticated as global admin" do
      it "returns audit logs" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: global_admin,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "includes ip_address and tracked_changes" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: global_admin,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:action] == "settings.update" }
        expect(log).to have_key(:trackedChanges)
        expect(log).to have_key(:ipAddress)
      end
    end

    context "when authenticated as member" do
      it "returns 403 forbidden" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: member,
                          organization: organization

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "when authenticated as viewer" do
      it "returns 403 forbidden" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: viewer,
                          organization: organization

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "with filters" do
      it "filters by actor_id" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization,
                          params: { actor_id: admin.id }

        expect_success
        expect(json_data.length).to eq(2)
        expect(json_data.map { |l| l[:actor][:id] }.uniq).to eq([ admin.id ])
      end

      it "filters by action" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization,
                          params: { log_action: "connector.create" }

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:action]).to eq("connector.create")
      end

      it "filters by from_date" do
        old_log = create(:organization_audit_log, organization: organization, actor: admin,
                                                  action: "connector.delete",
                                                  created_at: 10.days.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization,
                          params: { from_date: 1.day.ago.iso8601 }

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(old_log.id)
      end

      it "filters by to_date" do
        future_log = create(:organization_audit_log, organization: organization, actor: admin,
                                                     action: "connector.sync",
                                                     created_at: 1.day.from_now)

        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization,
                          params: { to_date: Time.current.iso8601 }

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(future_log.id)
      end

      it "filters by resource_type" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization,
                          params: { resource_type: "OrganizationConnector" }

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:resourceType]).to eq("OrganizationConnector")
      end
    end

    context "with pagination" do
      before do
        create_list(:organization_audit_log, 30, organization: organization, actor: admin)
      end

      it "paginates results" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization,
                          params: { page: 1, per_page: 10 }

        expect_success
        expect(json_data.length).to eq(10)
        expect(json_response[:meta][:total_pages]).to be > 1
      end
    end

    context "when logs belong to a different organization" do
      let(:other_org) { create(:organization) }
      let!(:other_log) { create(:organization_audit_log, organization: other_org, actor: admin) }

      it "does not return logs from other organizations" do
        authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs",
                          user: owner,
                          organization: organization

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(other_log.id)
      end
    end
  end
end
