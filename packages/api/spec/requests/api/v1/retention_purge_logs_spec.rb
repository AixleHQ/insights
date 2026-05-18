# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::RetentionPurgeLogs", type: :request do
  let(:owner) { create(:user) }
  let(:member) { create(:user) }
  let(:viewer) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:other_org) { create(:organization) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
    create(:organization_membership, user: member, organization: organization, role: "member")
    create(:organization_membership, user: viewer, organization: organization, role: "viewer")
    create(:organization_membership, user: global_admin, organization: organization, role: "member")
  end

  describe "GET /api/v1/organizations/:organization_id/retention_logs" do
    let!(:log1) { create(:retention_purge_log, organization: organization, records_deleted: 10) }
    let!(:log2) { create(:retention_purge_log, :with_deletions, organization: organization) }
    let!(:other_org_log) { create(:retention_purge_log, organization: other_org) }

    context "when authenticated as org owner" do
      it "returns paginated retention logs for the organization" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: owner,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(2)
      end

      it "does not include logs from other organizations" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: owner,
                          organization: organization

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids).not_to include(other_org_log.id)
      end

      it "returns logs with expected fields" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: owner,
                          organization: organization

        expect_success
        log = json_data.first
        expect(log).to include(
          :id, :organizationId, :retentionPolicyType,
          :retentionDaysApplied, :recordsDeleted, :status,
          :cutoffTimestamp, :jobRunAt, :createdAt
        )
      end

      it "returns logs ordered by job_run_at desc" do
        older_log = create(:retention_purge_log, organization: organization, job_run_at: 2.hours.ago)
        newer_log = create(:retention_purge_log, organization: organization, job_run_at: 1.hour.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: owner,
                          organization: organization

        expect_success
        ids = json_data.map { |l| l[:id] }
        expect(ids.index(newer_log.id)).to be < ids.index(older_log.id)
      end

      it "supports pagination" do
        create_list(:retention_purge_log, 10, organization: organization)

        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: owner,
                          organization: organization,
                          params: { page: 1, per_page: 5 }

        expect_success
        expect(json_data.length).to eq(5)
        expect(json_meta[:total_pages]).to be > 1
      end
    end

    context "when authenticated as global admin" do
      it "returns retention logs for the organization" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: global_admin,
                          organization: organization

        expect_success
        expect(json_data.length).to eq(2)
      end
    end

    context "when authenticated as member" do
      it "returns 403 Forbidden" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: member,
                          organization: organization

        expect_forbidden
      end
    end

    context "when authenticated as viewer" do
      it "returns 403 Forbidden" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: viewer,
                          organization: organization

        expect_forbidden
      end
    end

    context "when accessing a different organization" do
      let(:outsider) { create(:user) }

      before do
        create(:organization_membership, user: outsider, organization: other_org, role: "owner")
      end

      it "returns 403 Forbidden" do
        authenticated_get "/api/v1/organizations/#{organization.id}/retention_logs",
                          user: outsider,
                          organization: organization

        expect_forbidden
      end
    end
  end
end
