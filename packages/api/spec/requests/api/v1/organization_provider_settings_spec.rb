# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::OrganizationProviderSettings", type: :request do
  let(:owner) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:owner_membership) do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
  end
  let!(:member_membership) do
    create(:organization_membership, user: member, organization: organization, role: "member")
  end

  let(:base_path) { "/api/v1/organizations/#{organization.id}/organization_provider_settings" }

  describe "GET /api/v1/organizations/:organization_id/organization_provider_settings" do
    it "returns persisted settings for org owner" do
      create(:organization_provider_setting, organization: organization, provider: "github", enabled: false)

      authenticated_get base_path, user: owner, organization: organization

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:provider]).to eq("github")
      expect(json_data.first[:enabled]).to be(false)
    end

    it "returns persisted settings for org member (Eng Lead read access)" do
      create(:organization_provider_setting, organization: organization, provider: "slack", enabled: true)

      authenticated_get base_path, user: member, organization: organization

      expect_success
      expect(json_data.length).to eq(1)
    end

    it "returns empty array when no settings persisted (all defaults to enabled)" do
      authenticated_get base_path, user: owner, organization: organization

      expect_success
      expect(json_data).to be_empty
    end
  end

  describe "PATCH /api/v1/organizations/:organization_id/organization_provider_settings/:provider" do
    it "creates a new setting when none exists (upsert)" do
      authenticated_patch "#{base_path}/github",
                          user: owner,
                          organization: organization,
                          params: { organization_provider_setting: { enabled: false } }

      expect_success
      expect(json_data[:provider]).to eq("github")
      expect(json_data[:enabled]).to be(false)
      expect(organization.organization_provider_settings.find_by(provider: "github").enabled).to be(false)
    end

    it "updates an existing setting" do
      setting = create(:organization_provider_setting, organization: organization, provider: "github", enabled: true)

      authenticated_patch "#{base_path}/github",
                          user: owner,
                          organization: organization,
                          params: { organization_provider_setting: { enabled: false } }

      expect_success
      expect(json_data[:id]).to eq(setting.id)
      expect(json_data[:enabled]).to be(false)
    end

    it "returns 403 for org member trying to update" do
      authenticated_patch "#{base_path}/github",
                          user: member,
                          organization: organization,
                          params: { organization_provider_setting: { enabled: false } }

      expect(response).to have_http_status(:forbidden)
    end

    it "returns 400 for unknown provider" do
      authenticated_patch "#{base_path}/totally_fake_provider",
                          user: owner,
                          organization: organization,
                          params: { organization_provider_setting: { enabled: false } }

      expect(response).to have_http_status(:bad_request)
    end

    it "returns 400 when enabled param is missing" do
      authenticated_patch "#{base_path}/github",
                          user: owner,
                          organization: organization,
                          params: { organization_provider_setting: {} }

      expect(response).to have_http_status(:bad_request)
    end

    it "cannot modify settings belonging to another organization" do
      other_org = create(:organization)
      create(:organization_membership, user: owner, organization: other_org, role: "owner")
      create(:organization_provider_setting, organization: other_org, provider: "github", enabled: true)

      authenticated_patch "#{base_path}/github",
                          user: owner,
                          organization: organization,
                          params: { organization_provider_setting: { enabled: false } }

      expect_success
      expect(other_org.organization_provider_settings.find_by(provider: "github").enabled).to be(true)
    end
  end
end
