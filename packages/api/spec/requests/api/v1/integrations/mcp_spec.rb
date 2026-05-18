# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::Integrations::Mcp", type: :request do
  let(:internal_user) { create(:user, email: "engineer@example.com") }
  let(:organization) { create(:organization) }
  let!(:internal_membership) do
    create(:organization_membership, user: internal_user, organization: organization)
  end

  def expect_data_shape(body)
    expect(body["data"]).to be_a(Hash)
    expect(body["data"]["ingestToken"]).to match(/\Adb90_[a-f0-9]{64}\z/)
    expect(body["data"]["ingestHost"]).to eq(request.base_url)
    expect(body["data"]["organizationId"]).to eq(organization.id.to_s)
  end

  describe "POST /api/v1/integrations/mcp/exchange" do
    context "with a valid OIDC session and supported tool_name" do
      it "mints an ingest token for claude_code" do
        expect {
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: internal_user,
                             params: {
                               tool_name: "claude_code",
                               device_label: "test device"
                             }
        }.to change { internal_membership.user_tool_accounts.count }.by(1)

        expect(response).to have_http_status(:created)
        body = JSON.parse(response.body)
        expect_data_shape(body)
      end

      it "mints an ingest token for cursor" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: internal_user,
                             params: { tool_name: "cursor" }

        expect(response).to have_http_status(:created)
        body = JSON.parse(response.body)
        expect(body["data"]["ingestToken"]).to match(/\Adb90_[a-f0-9]{64}\z/)
        expect(body["data"]["ingestHost"]).to eq(request.base_url)
        expect(body["data"]["organizationId"]).to eq(organization.id.to_s)
      end

      it "rotates the token on each call (one account, fresh credential)" do
        tokens = 2.times.map do
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: internal_user,
                             params: { tool_name: "claude_code" }
          JSON.parse(response.body)["data"]["ingestToken"]
        end

        expect(internal_membership.reload.user_tool_accounts.count).to eq(1)
        expect(tokens.uniq.size).to eq(2)
      end
    end

    context "with an unsupported tool_name" do
      it "returns 422" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: internal_user,
                           params: { tool_name: "github_copilot" }

        expect(response).to have_http_status(:unprocessable_content)
        parsed = JSON.parse(response.body)
        expect(parsed["errors"]).to have_key("tool_name")
      end
    end

    context "with no tool_name" do
      it "returns 422" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: internal_user,
                           params: {}

        expect(response).to have_http_status(:unprocessable_content)
      end
    end

    context "without authentication" do
      it "returns 401" do
        post "/api/v1/integrations/mcp/exchange",
             params: { tool_name: "claude_code" }.to_json,
             headers: { "Content-Type" => "application/json" }

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "with a non-DBP email but valid membership" do
      let(:external_user) { create(:user, email: "outsider@example.com") }
      let!(:external_membership) do
        create(:organization_membership, user: external_user, organization: organization)
      end

      it "returns 201 (UserToolAccountPolicy on membership)" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: external_user,
                           params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:created)
        expect_data_shape(JSON.parse(response.body))
      end
    end

    context "when the user has no organization membership" do
      let(:lonely_user) { create(:user, email: "newhire@example.com") }

      it "returns 403" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: lonely_user,
                           params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:forbidden)
      end
    end
  end
end
