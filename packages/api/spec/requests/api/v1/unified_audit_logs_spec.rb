# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::UnifiedAuditLogs", type: :request do
  let(:owner)        { create(:user) }
  let(:member)       { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:project)      { create(:project, organization: organization) }

  before do
    create(:organization_membership, user: owner,        organization: organization, role: "owner")
    create(:organization_membership, user: member,       organization: organization, role: "member")
    create(:organization_membership, user: global_admin, organization: organization, role: "member")
  end

  def get_unified(user:, **params)
    authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs/unified",
                      user: user,
                      organization: organization,
                      params: params
  end

  describe "GET /api/v1/organizations/:organization_id/audit_logs/unified" do
    let!(:org_log) do
      create(:organization_audit_log, organization: organization, actor: owner,
                                      action: "settings.update", created_at: 2.hours.ago)
    end
    let!(:project_log) do
      create(:project_audit_log, project: project, actor: owner,
                                 action: "connector.create", created_at: 1.hour.ago)
    end
    let!(:admin_log) do
      create(:admin_audit_log, admin_user: global_admin,
                               resource_type: "Organization", resource_id: organization.id,
                               action: "organizations#update", created_at: 30.minutes.ago)
    end

    context "when authenticated as owner" do
      it "returns merged logs from all three scopes" do
        get_unified(user: owner)

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "includes a scope field identifying the source table" do
        get_unified(user: owner)

        expect_success
        scopes = json_data.map { |l| l[:scope] }
        expect(scopes).to include("organization", "project", "admin")
      end

      it "returns results sorted by created_at DESC" do
        get_unified(user: owner)

        expect_success
        timestamps = json_data.map { |l| l[:createdAt] }
        expect(timestamps).to eq(timestamps.sort.reverse)
      end

      it "includes actor details for org logs" do
        get_unified(user: owner)

        expect_success
        log = json_data.find { |l| l[:scope] == "organization" }
        expect(log[:actor]).to include(id: owner.id, email: owner.email)
      end

      it "includes actor details for admin logs via admin_user association" do
        get_unified(user: owner)

        expect_success
        log = json_data.find { |l| l[:scope] == "admin" }
        expect(log[:actor]).to include(id: global_admin.id, email: global_admin.email)
      end

      it "includes severity and outcome on each entry" do
        get_unified(user: owner)

        expect_success
        json_data.each do |log|
          expect(log[:severity]).to be_present
          expect(log[:outcome]).to be_present
        end
      end
    end

    context "when authenticated as global admin" do
      it "returns merged logs" do
        get_unified(user: global_admin)

        expect_success
        expect(json_data.length).to eq(3)
      end
    end

    context "when authenticated as member" do
      it "returns 403 forbidden" do
        get_unified(user: member)

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "without authentication" do
      it "returns 401 unauthorized" do
        get "/api/v1/organizations/#{organization.id}/audit_logs/unified"

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "with scope filter" do
      it "returns only organization logs when scope=organization" do
        get_unified(user: owner, scope: "organization")

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:scope]).to eq("organization")
      end

      it "returns only project logs when scope=project" do
        get_unified(user: owner, scope: "project")

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:scope]).to eq("project")
      end

      it "returns only admin logs for this org when scope=admin" do
        other_admin_log = create(:admin_audit_log, admin_user: global_admin,
                                                   resource_type: "Organization",
                                                   resource_id: SecureRandom.uuid)

        get_unified(user: owner, scope: "admin")

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).to include(admin_log.id)
        expect(ids).not_to include(other_admin_log.id)
      end

      it "includes admin logs for the org's projects when scope=admin" do
        project_admin_log = create(:admin_audit_log, admin_user: global_admin,
                                                     resource_type: "Project",
                                                     resource_id: project.id)

        get_unified(user: owner, scope: "admin")

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).to include(project_admin_log.id)
      end

      it "excludes admin logs for projects of other orgs when scope=admin" do
        other_org     = create(:organization)
        other_project = create(:project, organization: other_org)
        other_log     = create(:admin_audit_log, admin_user: global_admin,
                                                 resource_type: "Project",
                                                 resource_id: other_project.id)

        get_unified(user: owner, scope: "admin")

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(other_log.id)
      end

      it "returns 400 for an invalid scope value" do
        get_unified(user: owner, scope: "invalid")

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "with severity filter" do
      let!(:warning_log) do
        create(:organization_audit_log, organization: organization, actor: owner,
                                        action: "connector.delete", severity: "warning")
      end

      it "returns only entries matching the severity" do
        get_unified(user: owner, severity: "warning")

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:severity]).to eq("warning")
      end

      it "returns 400 for an invalid severity value" do
        get_unified(user: owner, severity: "critical_bad")

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "with outcome filter" do
      let!(:failed_log) do
        create(:organization_audit_log, organization: organization, actor: owner,
                                        action: "connector.sync", outcome: "failure")
      end

      it "returns only entries matching the outcome" do
        get_unified(user: owner, outcome: "failure")

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:outcome]).to eq("failure")
      end

      it "returns 400 for an invalid outcome value" do
        get_unified(user: owner, outcome: "unknown")

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "with actor_id filter" do
      let(:other_user) { create(:user) }
      let!(:other_log) do
        create(:organization_audit_log, organization: organization, actor: other_user,
                                        action: "settings.create")
      end

      it "returns only entries for the given actor across org and project scopes" do
        get_unified(user: owner, actor_id: owner.id)

        expect_success
        actor_ids = json_data.map { |l| l.dig(:actor, :id) }.compact.uniq
        expect(actor_ids).to eq([ owner.id ])
      end

      it "maps actor_id to admin_user_id for admin scope entries" do
        get_unified(user: global_admin, scope: "admin", actor_id: global_admin.id)

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:actor][:id]).to eq(global_admin.id)
      end
    end

    context "with date range filters (from / to)" do
      let!(:old_log) do
        create(:organization_audit_log, organization: organization, actor: owner,
                                        action: "member.invited", created_at: 10.days.ago)
      end

      it "excludes entries before from" do
        get_unified(user: owner, from: 1.day.ago.iso8601)

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(old_log.id)
      end

      it "excludes entries after to" do
        get_unified(user: owner, to: 3.days.ago.iso8601)

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).to include(old_log.id)
        expect(ids).not_to include(org_log.id)
      end

      it "accepts from_date as an alias for from" do
        get_unified(user: owner, from_date: 1.day.ago.iso8601)

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(old_log.id)
      end

      it "accepts to_date as an alias for to" do
        get_unified(user: owner, to_date: 3.days.ago.iso8601)

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).to include(old_log.id)
        expect(ids).not_to include(org_log.id)
      end

      it "returns 400 for an invalid from date" do
        get_unified(user: owner, from: "not-a-date")

        expect(response).to have_http_status(:bad_request)
      end

      it "returns 400 for an invalid to date" do
        get_unified(user: owner, to: "not-a-date")

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "with pagination" do
      before do
        create_list(:organization_audit_log, 15, organization: organization, actor: owner)
        create_list(:project_audit_log, 15, project: project, actor: owner)
      end

      it "returns the requested page slice" do
        get_unified(user: owner, page: 2, per_page: 10)

        expect_success
        expect(json_data.length).to eq(10)
      end

      it "includes accurate pagination meta with truncated flag" do
        get_unified(user: owner, page: 1, per_page: 10)

        expect_success
        meta = json_response[:meta]
        expect(meta[:current_page]).to eq(1)
        expect(meta[:total_pages]).to be > 1
        expect(meta[:total_count]).to be >= 30
        expect(meta[:per_page]).to eq(10)
        expect(meta[:truncated]).to eq(false)
      end
    end

    context "when a table reaches PER_TABLE_CAP" do
      before do
        stub_const("UnifiedAuditLogQueryBuilder::PER_TABLE_CAP", 2)
        create_list(:organization_audit_log, 3, organization: organization, actor: owner)
      end

      it "sets meta.truncated to true" do
        get_unified(user: owner, scope: "organization")

        expect_success
        expect(json_data.length).to eq(2)
        expect(json_response[:meta][:truncated]).to eq(true)
      end
    end

    context "when logs belong to a different organization" do
      let(:other_org) { create(:organization) }
      let!(:other_log) { create(:organization_audit_log, organization: other_org, actor: owner) }

      it "does not return logs from other organizations" do
        get_unified(user: owner)

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(other_log.id)
      end
    end

    context "when project logs belong to another organization's project" do
      let(:other_org)     { create(:organization) }
      let(:other_project) { create(:project, organization: other_org) }
      let!(:other_project_log) do
        create(:project_audit_log, project: other_project, actor: owner, action: "settings.update")
      end

      it "does not return project logs from other organizations" do
        get_unified(user: owner)

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(other_project_log.id)
      end

      it "does not return them when scope=project" do
        get_unified(user: owner, scope: "project")

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).to include(project_log.id)
        expect(ids).not_to include(other_project_log.id)
      end
    end

    context "when no audit logs exist" do
      let(:empty_org) { create(:organization) }

      before do
        create(:organization_membership, user: owner, organization: empty_org, role: "owner")
      end

      it "returns an empty data array with zero total_count" do
        authenticated_get "/api/v1/organizations/#{empty_org.id}/audit_logs/unified",
                          user: owner,
                          organization: empty_org

        expect_success
        expect(json_data).to eq([])
        expect(json_response[:meta][:total_count]).to eq(0)
        expect(json_response[:meta][:truncated]).to eq(false)
      end
    end
  end

  describe "GET /api/v1/organizations/:organization_id/audit_logs/unified/export" do
    let!(:org_log) do
      create(:organization_audit_log, organization: organization, actor: owner,
                                      action: "settings.update", severity: "info", outcome: "success")
    end
    let!(:warning_log) do
      create(:organization_audit_log, organization: organization, actor: owner,
                                      action: "connector.delete", severity: "warning", outcome: "failure")
    end
    let!(:project_log) do
      create(:project_audit_log, project: project, actor: owner, action: "connector.create")
    end

    def get_export(user:, **params)
      authenticated_get "/api/v1/organizations/#{organization.id}/audit_logs/unified/export",
                        user: user,
                        organization: organization,
                        params: params
    end

    context "when authenticated as owner" do
      it "returns 200 with text/csv content type" do
        get_export(user: owner)

        expect(response).to have_http_status(:ok)
        expect(response.content_type).to include("text/csv")
      end

      it "includes a Content-Disposition attachment header" do
        get_export(user: owner)

        expect(response.headers["Content-Disposition"]).to include("attachment")
        expect(response.headers["Content-Disposition"]).to include("audit_log_")
        expect(response.headers["Content-Disposition"]).to include(".csv")
      end

      it "includes the expected CSV header row" do
        get_export(user: owner)

        csv = CSV.parse(response.body, headers: true)
        expect(csv.headers).to eq(%w[timestamp scope actor_email actor_name action
                                     resource_type resource_id severity outcome ip_address user_agent])
      end

      it "includes all audit log entries in the CSV body" do
        get_export(user: owner)

        csv = CSV.parse(response.body, headers: true)
        actions = csv.map { |row| row["action"] }
        expect(actions).to include("settings.update", "connector.delete", "connector.create")
      end

      it "filters by severity when severity param is provided" do
        get_export(user: owner, severity: "warning")

        csv = CSV.parse(response.body, headers: true)
        expect(csv.length).to eq(1)
        expect(csv.first["severity"]).to eq("warning")
      end

      it "filters by outcome when outcome param is provided" do
        get_export(user: owner, outcome: "failure")

        csv = CSV.parse(response.body, headers: true)
        expect(csv.length).to eq(1)
        expect(csv.first["outcome"]).to eq("failure")
      end

      it "includes actor email in each row" do
        get_export(user: owner, scope: "organization")

        csv = CSV.parse(response.body, headers: true)
        expect(csv.first["actor_email"]).to eq(owner.email)
      end

      it "returns 400 for an invalid severity value" do
        get_export(user: owner, severity: "extreme")

        expect(response).to have_http_status(:bad_request)
      end

      it "returns 400 for an invalid scope value" do
        get_export(user: owner, scope: "global")

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "when authenticated as global admin" do
      it "returns 200 CSV" do
        get_export(user: global_admin)

        expect(response).to have_http_status(:ok)
        expect(response.content_type).to include("text/csv")
      end
    end

    context "when authenticated as member" do
      it "returns 403 forbidden" do
        get_export(user: member)

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "without authentication" do
      it "returns 401 unauthorized" do
        get "/api/v1/organizations/#{organization.id}/audit_logs/unified/export"

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when PER_TABLE_CAP would normally truncate results" do
      before do
        stub_const("UnifiedAuditLogQueryBuilder::PER_TABLE_CAP", 1)
        create_list(:organization_audit_log, 3, organization: organization, actor: owner)
      end

      it "exports all rows up to EXPORT_PER_TABLE_LIMIT without being bounded by PER_TABLE_CAP" do
        get_export(user: owner, scope: "organization")

        csv = CSV.parse(response.body, headers: true)
        expect(csv.length).to be > 1
      end
    end

    context "when EXPORT_PER_TABLE_LIMIT is exceeded" do
      before do
        stub_const("Api::V1::UnifiedAuditLogsController::EXPORT_PER_TABLE_LIMIT", 1)
        create_list(:organization_audit_log, 3, organization: organization, actor: owner)
      end

      it "returns 422 unprocessable_entity with a helpful error message" do
        get_export(user: owner, scope: "organization")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json_response[:error]).to include("Export exceeds row limit")
      end
    end
  end
end
