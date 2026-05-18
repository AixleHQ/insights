# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin Retention", type: :request do
  let(:global_admin) { create(:user, :global_admin) }
  let(:regular_user) { create(:user) }

  describe "GET /admin/retention_logs" do
    let(:org1) { create(:organization) }
    let(:org2) { create(:organization) }

    let!(:log1) { create(:retention_purge_log, organization: org1) }
    let!(:log2) { create(:retention_purge_log, :failed, organization: org2) }

    context "when authenticated as a global admin" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(global_admin)
      end

      it "returns all retention logs across organizations" do
        get admin_retention_logs_path, as: :json

        expect(response).to have_http_status(:ok)
        data = response.parsed_body["data"]
        expect(data.length).to eq(2)
      end

      it "returns logs with expected fields" do
        get admin_retention_logs_path, as: :json

        expect(response).to have_http_status(:ok)
        log = response.parsed_body["data"].first
        expect(log).to include(
          "id", "organizationId", "retentionPolicyType",
          "retentionDaysApplied", "recordsDeleted", "status",
          "cutoffTimestamp", "jobRunAt", "createdAt"
        )
      end

      it "returns pagination metadata" do
        get admin_retention_logs_path, as: :json

        expect(response).to have_http_status(:ok)
        meta = response.parsed_body["meta"]
        expect(meta).to include("current_page", "total_pages", "total_count", "per_page")
      end

      it "supports pagination" do
        create_list(:retention_purge_log, 5, organization: org1)

        get admin_retention_logs_path, params: { page: 1, per_page: 3 }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body["data"].length).to eq(3)
        expect(response.parsed_body["meta"]["total_pages"]).to be > 1
      end
    end

    context "when authenticated as a non-admin user" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(regular_user)
      end

      it "returns 403 Forbidden" do
        get admin_retention_logs_path, as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "when unauthenticated" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(nil)
      end

      it "returns 403 Forbidden" do
        get admin_retention_logs_path, as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "POST /admin/retention/purge" do
    context "when authenticated as a global admin" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(global_admin)
      end

      it "enqueues DataRetentionPurgeJob and returns 200" do
        expect(DataRetentionPurgeJob).to receive(:perform_async)

        post admin_purge_retention_path, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body["enqueued"]).to be true
      end
    end

    context "when authenticated as a non-admin user" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(regular_user)
      end

      it "returns 403 Forbidden" do
        post admin_purge_retention_path, as: :json

        expect(response).to have_http_status(:forbidden)
        expect(response.parsed_body["error"]).to eq("Forbidden")
      end
    end

    context "when unauthenticated" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(nil)
      end

      it "returns 403 Forbidden" do
        post admin_purge_retention_path, as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end
  end
end
