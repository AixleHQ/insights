# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::ExportRecords", type: :request do
  let(:owner)        { create(:user) }
  let(:member_user)  { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner,       organization: organization, role: "owner")
    create(:organization_membership, user: member_user, organization: organization, role: "member")
  end

  let(:base_path) { "/api/v1/organizations/#{organization.id}/export_records" }

  # ── INDEX ───────────────────────────────────────────────────────────────────

  describe "GET /export_records" do
    let!(:record) { create(:export_record, organization: organization, created_by: owner) }

    it "returns 401 for unauthenticated requests" do
      get base_path
      expect_unauthorized
    end

    it "returns 403 for org members (non-owner)" do
      authenticated_get base_path, user: member_user, organization: organization
      expect_forbidden
    end

    it "returns a list for the org owner" do
      authenticated_get base_path, user: owner, organization: organization
      expect_success
      expect(json_data).to be_an(Array)
      expect(json_data.first[:id]).to eq(record.id)
    end

    it "only returns records for the current organization" do
      other_org   = create(:organization)
      other_owner = create(:user)
      create(:organization_membership, user: other_owner, organization: other_org, role: "owner")
      create(:export_record, organization: other_org, created_by: other_owner)

      authenticated_get base_path, user: owner, organization: organization
      expect_success
      expect(json_data.length).to eq(1)
    end

    it "includes downloadUrl key for ready, non-expired records" do
      create(:export_record, :ready, organization: organization, created_by: owner)
      authenticated_get base_path, user: owner, organization: organization
      expect_success
      ready_record = json_data.find { |r| r[:status] == "ready" }
      expect(ready_record).to have_key(:downloadUrl)
      # When a URL is present it must use HTTPS (no mixed-content downloads)
      expect(ready_record[:downloadUrl]).to start_with("https://") if ready_record[:downloadUrl]
    end

    it "returns nil downloadUrl when no file is attached" do
      create(:export_record, :ready, organization: organization, created_by: owner)
      authenticated_get base_path, user: owner, organization: organization
      expect_success
      ready_record = json_data.find { |r| r[:status] == "ready" }
      expect(ready_record[:downloadUrl]).to be_nil
    end

    it "includes the createdBy user (id, name, email)" do
      authenticated_get base_path, user: owner, organization: organization
      expect_success
      created_by = json_data.first[:createdBy]
      expect(created_by[:id]).to eq(owner.id)
      expect(created_by[:email]).to eq(owner.email)
      expect(created_by).to have_key(:name)
    end
  end

  # ── CREATE ──────────────────────────────────────────────────────────────────

  describe "POST /export_records" do
    let(:valid_params) { { export_record: { report_type: "cost_by_tool", format: "csv" } } }

    it "returns 401 for unauthenticated requests" do
      post base_path, params: valid_params.to_json,
                      headers: { "Content-Type" => "application/json" }
      expect_unauthorized
    end

    it "returns 403 for org members (non-owner)" do
      authenticated_post base_path, user: member_user,
                                    organization: organization,
                                    params: valid_params
      expect_forbidden
    end

    it "creates an export record and returns 202 Accepted" do
      allow(GenerateExportJob).to receive(:perform_async)

      expect {
        authenticated_post base_path, user: owner, organization: organization, params: valid_params
      }.to change(ExportRecord, :count).by(1)

      expect(response).to have_http_status(:accepted)
      expect(json_data[:reportType]).to eq("cost_by_tool")
      expect(json_data[:status]).to eq("pending")
    end

    it "enqueues GenerateExportJob after creation" do
      expect(GenerateExportJob).to receive(:perform_async).with(instance_of(String))
      authenticated_post base_path, user: owner, organization: organization, params: valid_params
    end

    it "defaults format to csv when not provided" do
      allow(GenerateExportJob).to receive(:perform_async)
      authenticated_post base_path, user: owner, organization: organization,
                                    params: { export_record: { report_type: "cost_by_tool" } }
      expect(response).to have_http_status(:accepted)
      expect(json_data[:format]).to eq("csv")
    end

    it "returns 422 for an invalid report_type" do
      authenticated_post base_path, user: owner, organization: organization,
                                    params: { export_record: { report_type: "invalid" } }
      expect_unprocessable
    end
  end
end
