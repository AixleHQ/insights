# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::ProjectAuditLogs", type: :request do
  let(:owner_user) { create(:user) }
  let(:admin_user) { create(:user) }
  let(:member_user) { create(:user) }
  let(:viewer_user) { create(:user) }
  let(:project) { create(:project) }

  before do
    create(:project_membership, user: owner_user, project: project, role: "owner")
    create(:project_membership, user: admin_user, project: project, role: "admin")
    create(:project_membership, user: member_user, project: project, role: "member")
    create(:project_membership, user: viewer_user, project: project, role: "viewer")
  end

  describe "GET /api/v1/projects/:project_id/audit_logs" do
    let!(:log1) { create(:project_audit_log, project: project, actor: admin_user, action: "connector.create") }
    let!(:log2) { create(:project_audit_log, :settings_update, project: project, actor: owner_user) }
    let!(:log3) { create(:project_audit_log, :member_role_changed, project: project, actor: admin_user) }

    context "when authenticated as owner" do
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

      it "includes tracked_changes" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        log = json_data.find { |l| l[:action] == "settings.update" }
        expect(log[:trackedChanges]).to have_key(:key)
      end

      it "returns logs ordered by created_at desc" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: owner_user

        expect_success
        timestamps = json_data.map { |l| l[:createdAt] }
        expect(timestamps).to eq(timestamps.sort.reverse)
      end
    end

    context "when authenticated as admin" do
      it "returns audit logs" do
        authenticated_get "/api/v1/projects/#{project.id}/audit_logs", user: admin_user

        expect_success
        expect(json_data.length).to eq(3)
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
  end
end
