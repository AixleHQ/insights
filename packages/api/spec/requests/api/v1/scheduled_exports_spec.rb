# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::ScheduledExports", type: :request do
  let(:owner)       { create(:user) }
  let(:member_user) { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner,       organization: organization, role: "owner")
    create(:organization_membership, user: member_user, organization: organization, role: "member")
  end

  let(:base_path) { "/api/v1/organizations/#{organization.id}/scheduled_exports" }

  let(:valid_params) do
    {
      scheduled_export: {
        report_type: "cost_by_tool",
        frequency:   "daily",
        recipients:  [ "user@example.com" ]
      }
    }
  end

  # ── INDEX ───────────────────────────────────────────────────────────────────

  describe "GET /scheduled_exports" do
    let!(:export) { create(:scheduled_export, organization: organization, created_by: owner) }

    it "returns 401 for unauthenticated requests" do
      get base_path
      expect_unauthorized
    end

    it "returns 403 for org members (non-owner)" do
      authenticated_get base_path, user: member_user, organization: organization
      expect_forbidden
    end

    it "returns a list of exports for the org owner" do
      authenticated_get base_path, user: owner, organization: organization
      expect_success
      expect(json_data).to be_an(Array)
      expect(json_data.first[:id]).to eq(export.id)
    end

    it "only returns exports belonging to the current organization" do
      other_org    = create(:organization)
      other_owner  = create(:user)
      create(:organization_membership, user: other_owner, organization: other_org, role: "owner")
      create(:scheduled_export, organization: other_org, created_by: other_owner)

      authenticated_get base_path, user: owner, organization: organization
      expect_success
      expect(json_data.length).to eq(1)
    end
  end

  # ── CREATE ──────────────────────────────────────────────────────────────────

  describe "POST /scheduled_exports" do
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

    it "creates a scheduled export and returns 201" do
      expect {
        authenticated_post base_path, user: owner,
                                      organization: organization,
                                      params: valid_params
      }.to change(ScheduledExport, :count).by(1)

      expect_created
      expect(json_data[:reportType]).to eq("cost_by_tool")
      expect(json_data[:frequency]).to eq("daily")
      expect(json_data[:recipients]).to eq([ "user@example.com" ])
      expect(json_data[:active]).to be(true)
      expect(json_data[:nextRunAt]).to be_present
    end

    it "returns 422 when report_type is missing" do
      params = { scheduled_export: { frequency: "daily", recipients: [ "u@example.com" ] } }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_unprocessable
    end

    it "returns 422 when frequency is missing" do
      params = { scheduled_export: { report_type: "cost_by_tool", recipients: [ "u@example.com" ] } }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_unprocessable
    end

    it "returns 422 when recipients is empty" do
      params = { scheduled_export: { report_type: "cost_by_tool", frequency: "daily", recipients: [] } }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_unprocessable
    end

    it "returns 422 when day_of_week is missing for a weekly export" do
      params = {
        scheduled_export: {
          report_type: "cost_by_tool", frequency: "weekly", recipients: [ "u@example.com" ]
        }
      }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_unprocessable
    end

    it "returns 422 when day_of_month is missing for a monthly export" do
      params = {
        scheduled_export: {
          report_type: "cost_by_tool", frequency: "monthly", recipients: [ "u@example.com" ]
        }
      }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_unprocessable
    end

    it "creates a weekly export with day_of_week" do
      params = {
        scheduled_export: {
          report_type: "cost_by_tool", frequency: "weekly",
          day_of_week: 1, recipients: [ "u@example.com" ]
        }
      }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_created
      expect(json_data[:frequency]).to eq("weekly")
      expect(json_data[:dayOfWeek]).to eq(1)
    end

    it "creates a monthly export with day_of_month" do
      params = {
        scheduled_export: {
          report_type: "cost_by_tool", frequency: "monthly",
          day_of_month: 15, recipients: [ "u@example.com" ]
        }
      }
      authenticated_post base_path, user: owner, organization: organization, params: params
      expect_created
      expect(json_data[:frequency]).to eq("monthly")
      expect(json_data[:dayOfMonth]).to eq(15)
    end
  end

  # ── UPDATE ──────────────────────────────────────────────────────────────────

  describe "PATCH /scheduled_exports/:id" do
    let!(:export) { create(:scheduled_export, organization: organization, created_by: owner) }

    it "returns 403 for org members (non-owner)" do
      authenticated_patch "#{base_path}/#{export.id}",
                          user: member_user,
                          organization: organization,
                          params: { scheduled_export: { active: false } }
      expect_forbidden
    end

    it "updates the export and returns 200" do
      authenticated_patch "#{base_path}/#{export.id}",
                          user: owner,
                          organization: organization,
                          params: { scheduled_export: { active: false } }
      expect_success
      expect(json_data[:active]).to be(false)
    end

    it "returns 404 for an export belonging to another org" do
      other_org   = create(:organization)
      other_owner = create(:user)
      create(:organization_membership, user: other_owner, organization: other_org, role: "owner")
      other_export = create(:scheduled_export, organization: other_org, created_by: other_owner)

      authenticated_patch "#{base_path}/#{other_export.id}",
                          user: owner,
                          organization: organization,
                          params: { scheduled_export: { active: false } }
      expect_not_found
    end
  end

  # ── DESTROY ─────────────────────────────────────────────────────────────────

  describe "DELETE /scheduled_exports/:id" do
    let!(:export) { create(:scheduled_export, organization: organization, created_by: owner) }

    it "returns 403 for org members (non-owner)" do
      authenticated_delete "#{base_path}/#{export.id}",
                           user: member_user,
                           organization: organization
      expect_forbidden
    end

    it "destroys the export and returns 204" do
      expect {
        authenticated_delete "#{base_path}/#{export.id}",
                             user: owner,
                             organization: organization
      }.to change(ScheduledExport, :count).by(-1)

      expect_no_content
    end
  end
end
