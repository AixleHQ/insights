# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::ProjectAuditLogs", type: :request do
  let(:organization) { create(:organization) }
  let(:org_owner) { create(:user) }
  let(:org_admin) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:project) { create(:project, organization: organization) }

  # Users with project-level membership only (not org admins)
  let(:owner_user) { create(:user) }
  let(:admin_user) { create(:user) }
  let(:member_user) { create(:user) }
  let(:viewer_user) { create(:user) }

  before do
    create(:organization_membership, user: org_owner, organization: organization, role: "owner")
    create(:organization_membership, user: org_admin, organization: organization, role: "owner")
    create(:organization_membership, user: global_admin, organization: organization, role: "member")

    # Project-only users are org members, not org admins
    create(:organization_membership, user: owner_user, organization: organization, role: "member")
    create(:organization_membership, user: admin_user, organization: organization, role: "member")
    create(:organization_membership, user: member_user, organization: organization, role: "member")
    create(:organization_membership, user: viewer_user, organization: organization, role: "viewer")

    create(:project_membership, user: owner_user, project: project, role: "owner")
    create(:project_membership, user: admin_user, project: project, role: "admin")
    create(:project_membership, user: member_user, project: project, role: "member")
    create(:project_membership, user: viewer_user, project: project, role: "viewer")
  end

  describe "GET /api/v1/projects/:project_id/audit_logs" do
    let!(:log1) { create(:project_audit_log, project: project, actor: admin_user, action: "connector.create", ip_address: "10.0.0.1") }
    let!(:log2) { create(:project_audit_log, :settings_update, project: project, actor: owner_user) }
    let!(:log3) { create(:project_audit_log, :member_role_changed, project: project, actor: admin_user) }

    context "when authenticated as project owner (project admin, not org admin)" do
      it "returns paginated audit logs" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "includes actor details" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        log = json_data.find { |l| l[:action] == "connector.create" }
        expect(log[:actor]).to include(id: admin_user.id, email: admin_user.email)
      end

      it "omits ip_address (restricted for non-org-admin)" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        json_data.each do |log|
          expect(log).not_to have_key(:ipAddress)
        end
      end

      it "omits tracked_changes (restricted for non-org-admin)" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        json_data.each do |log|
          expect(log).not_to have_key(:trackedChanges)
        end
      end

      it "returns logs ordered by created_at desc" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        timestamps = json_data.map { |l| l[:createdAt] }
        expect(timestamps).to eq(timestamps.sort.reverse)
      end
    end

    context "when authenticated as project admin (non-org-admin)" do
      it "returns audit logs" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: admin_user

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "omits ip_address" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: admin_user

        expect_success
        json_data.each { |log| expect(log).not_to have_key(:ipAddress) }
      end

      it "omits tracked_changes" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: admin_user

        expect_success
        json_data.each { |log| expect(log).not_to have_key(:trackedChanges) }
      end
    end

    context "when authenticated as org admin" do
      it "returns audit logs" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: org_admin,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "includes ip_address" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: org_admin,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:action] == "connector.create" }
        expect(log).to have_key(:ipAddress)
        expect(log[:ipAddress]).to eq("10.0.0.1")
      end

      it "includes tracked_changes" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: org_admin,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:action] == "settings.update" }
        expect(log).to have_key(:trackedChanges)
        expect(log[:trackedChanges]).to have_key(:key)
      end
    end

    context "when authenticated as org owner" do
      it "returns audit logs with full fields" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: org_owner,
                          organization: organization

        expect_success
        log = json_data.find { |l| l[:action] == "settings.update" }
        expect(log).to have_key(:trackedChanges)
        expect(log).to have_key(:ipAddress)
      end
    end

    context "when authenticated as global admin" do
      it "returns audit logs" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: global_admin,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(3)
      end

      it "includes ip_address and tracked_changes" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
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
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: member_user

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "when authenticated as viewer" do
      it "returns 403 forbidden" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: viewer_user

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "with filters" do
      it "filters by actor_id" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { actor_id: admin_user.id }

        expect_success
        expect(json_data.length).to eq(2)
        expect(json_data.map { |l| l[:actor][:id] }.uniq).to eq([ admin_user.id ])
      end

      it "filters by action" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { log_action: "connector.create" }

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:action]).to eq("connector.create")
      end

      it "filters by from_date" do
        old_log = create(:project_audit_log, project: project, actor: admin_user,
                                             action: "connector.delete",
                                             created_at: 10.days.ago)

        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { from_date: 1.day.ago.iso8601 }

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(old_log.id)
      end

      it "filters by to_date" do
        future_log = create(:project_audit_log, project: project, actor: admin_user,
                                                action: "connector.sync",
                                                created_at: 1.day.from_now)

        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { to_date: Time.current.iso8601 }

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(future_log.id)
      end

      it "filters by resource_type" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { resource_type: "ProjectConnector" }

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:resourceType]).to eq("ProjectConnector")
      end
    end

    context "with pagination" do
      before do
        create_list(:project_audit_log, 30, project: project, actor: admin_user)
      end

      it "paginates results" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { page: 1, per_page: 10 }

        expect_success
        expect(json_data.length).to eq(10)
        expect(json_response[:meta][:total_pages]).to be > 1
      end
    end

    context "when logs belong to a different project" do
      let(:other_project) { create(:project) }
      let!(:other_log) { create(:project_audit_log, project: other_project, actor: admin_user) }

      it "does not return logs from other projects" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(other_log.id)
      end
    end

    context "with invalid date params" do
      it "returns 400 for malformed from_date" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { from_date: "not-a-date" }

        expect(response).to have_http_status(:bad_request)
      end

      it "returns 400 for malformed to_date" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs",
                          user: owner_user,
                          params: { to_date: "not-a-date" }

        expect(response).to have_http_status(:bad_request)
      end
    end
  end

  describe "GET /api/v1/projects/:project_id/audit_logs for personal project" do
    let(:personal_owner) { create(:user) }
    let(:personal_project) { create(:project, :personal, owner: personal_owner) }
    let!(:personal_log) { create(:project_audit_log, project: personal_project, actor: personal_owner, ip_address: "192.168.1.1") }

    it "allows the personal project owner to view audit logs" do
      authenticated_get "/api/v1/projects/#{personal_project.id}/audit_logs", user: personal_owner

      expect_success
      expect(json_data.map { |l| l[:id] }).to include(personal_log.id)
    end

    it "includes ip_address and tracked_changes for personal project owner (full access)" do
      authenticated_get "/api/v1/projects/#{personal_project.id}/audit_logs", user: personal_owner

      expect_success
      log = json_data.first
      expect(log).to have_key(:ipAddress)
      expect(log).to have_key(:trackedChanges)
    end

    it "denies access to another user (404 — project not visible via authorized_scope)" do
      other = create(:user)

      authenticated_get "/api/v1/projects/#{personal_project.id}/audit_logs", user: other

      # authorized_scope(Project.all) excludes projects the user can't see,
      # so find raises RecordNotFound → 404 rather than 403
      expect(response).to have_http_status(:not_found)
    end
  end
end
