# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::Integrations::Mcp", type: :request do
  let(:internal_user) { create(:user, email: "engineer@example.com") }
  let(:organization) { create(:organization) }
  let!(:internal_membership) do
    create(:organization_membership, user: internal_user, organization: organization)
  end

  TOKEN_RE = /\Adb90_[a-f0-9]{64}\z/

  def expect_single_tool_shape(body)
    expect(body["data"]).to be_a(Hash)
    expect(body["data"]["ingestToken"]).to match(TOKEN_RE)
    expect(body["data"]["accounts"]).to be_a(Hash)
    expect(body["data"]["accounts"]).not_to be_empty
    body["data"]["accounts"].each_value do |entry|
      expect(entry["ingestToken"]).to match(TOKEN_RE)
    end
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
        expect_single_tool_shape(body)
        expect(body["data"]["toolName"]).to eq("claude_code")
        expect(body["data"]["accounts"].keys.sort).to eq([ "claude_code" ])
        expect(
          internal_membership.reload.user_tool_accounts.find_by!(tool_name: "claude_code").connection_state
        ).to eq("waiting_for_connection")
      end

      it "mints an ingest token for cursor" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: internal_user,
                             params: { tool_name: "cursor" }

        expect(response).to have_http_status(:created)
        body = JSON.parse(response.body)
        expect_single_tool_shape(body)
        expect(body["data"]["accounts"]["cursor"]["ingestToken"]).to match(TOKEN_RE)
        expect(
          internal_membership.reload.user_tool_accounts.find_by!(tool_name: "cursor").connection_state
        ).to eq("waiting_for_connection")
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

    context "with a valid OIDC session and supported tools payload" do
      it "mints ingest tokens for claude_code and cursor in one call" do
        expect {
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: internal_user,
                             params: {
                               tools: [ "cursor", "claude_code", "cursor" ],
                               device_label: "multi MCP"
                             }
        }.to change { internal_membership.user_tool_accounts.count }.by(2)

        expect(response).to have_http_status(:created)
        data = JSON.parse(response.body)["data"]
        expect(data["ingestToken"]).to be_nil
        accounts = data["accounts"]
        expect(accounts.keys.sort).to eq([ "claude_code", "cursor" ])
        expect(accounts["claude_code"]["ingestToken"]).to match(TOKEN_RE)
        expect(accounts["cursor"]["ingestToken"]).to match(TOKEN_RE)
      end

      it "rotates tokens for requested accounts independently" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: internal_user,
                           params: { tools: [ "claude_code", "cursor" ] }
        cc1 = JSON.parse(response.body)["data"]["accounts"]["claude_code"]["ingestToken"]
        cr1 = JSON.parse(response.body)["data"]["accounts"]["cursor"]["ingestToken"]

        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: internal_user,
                           params: { tools: [ "claude_code", "cursor" ] }
        cc2 = JSON.parse(response.body)["data"]["accounts"]["claude_code"]["ingestToken"]
        cr2 = JSON.parse(response.body)["data"]["accounts"]["cursor"]["ingestToken"]

        expect(internal_membership.reload.user_tool_accounts.count).to eq(2)
        expect([ cc1, cr1 ].uniq.size).to eq(2)
        expect(cc1).not_to eq(cc2)
        expect(cr1).not_to eq(cr2)
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

    context "with an unsupported tools array entry" do
      it "returns 422" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: internal_user,
                           params: { tools: [ "claude_code", "github_copilot" ] }

        expect(response).to have_http_status(:unprocessable_content)
        parsed = JSON.parse(response.body)
        expect(parsed["errors"]).to have_key("tools")
      end
    end

    context "without tool_name nor tools" do
      it "returns 422" do
        authenticated_post "/api/v1/integrations/mcp/exchange",
                           user: internal_user,
                           params: {}

        expect(response).to have_http_status(:unprocessable_content)
        parsed = JSON.parse(response.body)
        expect(parsed["errors"]).to have_key("base")
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
        expect_single_tool_shape(JSON.parse(response.body))
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

    context "when the user has two organization memberships" do
      let(:multi_user) { create(:user, email: "two-orgs@example.com") }
      let(:primary_org) { create(:organization) }
      let(:secondary_org) { create(:organization) }
      let!(:primary_membership) do
        travel_to(3.days.ago) do
          create(:organization_membership, user: multi_user, organization: primary_org)
        end
      end
      let!(:secondary_membership) do
        travel_to(1.day.ago) do
          create(:organization_membership, user: multi_user, organization: secondary_org)
        end
      end

      it "returns 201 for the secondary org when X-Organization-ID selects it" do
        expect {
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: multi_user,
                             organization: secondary_org,
                             params: { tool_name: "claude_code" }
        }.to change { secondary_membership.reload.user_tool_accounts.count }.by(1)
          .and change { primary_membership.reload.user_tool_accounts.count }.by(0)

        expect(response).to have_http_status(:created)
        body = JSON.parse(response.body)
        expect(body["data"]["organizationId"]).to eq(secondary_org.id.to_s)
        expect(body["data"]["ingestToken"]).to match(TOKEN_RE)
        account = secondary_membership.user_tool_accounts.find_by!(tool_name: "claude_code")
        expect(account.organization_membership_id).to eq(secondary_membership.id)
      end

      it "falls back to the oldest membership when X-Organization-ID is absent" do
        expect {
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: multi_user,
                             params: { tool_name: "claude_code" }
        }.to change { primary_membership.reload.user_tool_accounts.count }.by(1)
          .and change { secondary_membership.reload.user_tool_accounts.count }.by(0)

        expect(response).to have_http_status(:created)
        expect(JSON.parse(response.body)["data"]["organizationId"]).to eq(primary_org.id.to_s)
      end

      it "returns 403 and does not touch tool accounts when X-Organization-ID is not a membership org" do
        other_org = create(:organization)

        expect {
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: multi_user,
                             organization: other_org,
                             params: { tool_name: "claude_code" }
        }.to change { primary_membership.reload.user_tool_accounts.count }.by(0)
          .and change { secondary_membership.reload.user_tool_accounts.count }.by(0)

        expect(response).to have_http_status(:forbidden)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("Forbidden")
        expect(parsed["message"]).to include("specified organization")
      end

      it "returns 403 and does not touch tool accounts when X-Organization-ID is malformed" do
        expect {
          post "/api/v1/integrations/mcp/exchange",
               params: { tool_name: "claude_code" }.to_json,
               headers: auth_headers_for(multi_user).merge("X-Organization-ID" => "not-a-uuid")
        }.to change { primary_membership.reload.user_tool_accounts.count }.by(0)
          .and change { secondary_membership.reload.user_tool_accounts.count }.by(0)

        expect(response).to have_http_status(:forbidden)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("Forbidden")
        expect(parsed["message"]).to include("specified organization")
      end

      it "returns 403 and does not touch tool accounts when X-Organization-ID is blank" do
        expect {
          post "/api/v1/integrations/mcp/exchange",
               params: { tool_name: "claude_code" }.to_json,
               headers: auth_headers_for(multi_user).merge("X-Organization-ID" => "   ")
        }.to change { primary_membership.reload.user_tool_accounts.count }.by(0)
          .and change { secondary_membership.reload.user_tool_accounts.count }.by(0)

        expect(response).to have_http_status(:forbidden)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("Forbidden")
        expect(parsed["message"]).to include("specified organization")
      end

      it "scopes multi-tool exchange to the header-selected membership" do
        expect {
          authenticated_post "/api/v1/integrations/mcp/exchange",
                             user: multi_user,
                             organization: secondary_org,
                             params: { tools: %w[cursor claude_code] }
        }.to change { secondary_membership.reload.user_tool_accounts.count }.by(2)
          .and change { primary_membership.reload.user_tool_accounts.count }.by(0)

        expect(response).to have_http_status(:created)
        data = JSON.parse(response.body)["data"]
        expect(data["organizationId"]).to eq(secondary_org.id.to_s)
      end
    end
  end
end
