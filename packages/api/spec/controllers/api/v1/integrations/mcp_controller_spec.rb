# frozen_string_literal: true

require "rails_helper"

RSpec.describe Api::V1::Integrations::McpController, type: :controller do
  describe "POST #exchange" do
    let(:user) { create(:user) }
    let(:organization) { create(:organization) }
    let!(:membership) { create(:organization_membership, user: user, organization: organization) }

    before { authenticate_user(user) }

    context "when the user has a primary organization membership" do
      it "calls Mcp::IngestTokenExchangeService and renders its status and body" do
        payload = {
          data: {
            ingestHost: "http://test.host",
            organizationId: organization.id.to_s,
            accounts: { "claude_code" => { ingestToken: "db90_testtoken" } },
            ingestToken: "db90_testtoken",
            toolName: "claude_code"
          }
        }
        result = Mcp::IngestTokenExchangeService::Result.new(http_status: :created, body: payload)
        expect(Mcp::IngestTokenExchangeService).to receive(:call).with(
          membership: membership,
          tool_name: "claude_code",
          tools: nil,
          ingest_host: "http://test.host"
        ).and_return(result)

        post :exchange, params: { tool_name: "claude_code", device_label: "unit" }

        expect(response).to have_http_status(:created)
        expect(JSON.parse(response.body)).to eq(payload.deep_stringify_keys)
      end

      it "passes a tools array through to the service" do
        result = Mcp::IngestTokenExchangeService::Result.new(
          http_status: :created,
          body: { data: { ingestHost: "http://test.host", organizationId: organization.id.to_s, accounts: {} } }
        )
        tools_param = %w[cursor claude_code]
        expect(Mcp::IngestTokenExchangeService).to receive(:call) do |kwargs|
          expect(kwargs[:membership]).to eq(membership)
          expect(kwargs[:tool_name]).to be_nil
          expect(kwargs[:ingest_host]).to eq("http://test.host")
          expect(Array(kwargs[:tools]).map(&:to_s)).to eq(tools_param)
          result
        end

        post :exchange, params: { tools: tools_param }

        expect(response).to have_http_status(:created)
      end
    end

    context "when the user has two memberships and X-Organization-ID selects the newer one" do
      let(:two_org_user) { create(:user) }
      let(:older_org) { create(:organization) }
      let(:newer_org) { create(:organization) }
      let!(:older_membership) do
        travel_to(3.days.ago) do
          create(:organization_membership, user: two_org_user, organization: older_org)
        end
      end
      let!(:newer_membership) do
        travel_to(1.day.ago) do
          create(:organization_membership, user: two_org_user, organization: newer_org)
        end
      end

      before { authenticate_user(two_org_user) }

      it "calls the service with the header-selected membership" do
        result = Mcp::IngestTokenExchangeService::Result.new(
          http_status: :created,
          body: { data: { ingestHost: "http://test.host", organizationId: newer_org.id.to_s, accounts: {} } }
        )
        expect(Mcp::IngestTokenExchangeService).to receive(:call).with(
          membership: newer_membership,
          tool_name: "claude_code",
          tools: nil,
          ingest_host: "http://test.host"
        ).and_return(result)

        request.headers["X-Organization-ID"] = newer_org.id.to_s
        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:created)
      end

      it "returns 422 organization_selection_required when the header is absent and no default is set" do
        expect(Mcp::IngestTokenExchangeService).not_to receive(:call)

        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:unprocessable_content)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("organization_selection_required")
        expect(parsed["organizations"].map { |o| o["id"] })
          .to contain_exactly(older_org.id.to_s, newer_org.id.to_s)
      end

      it "binds the default_org_id membership when the preference is set" do
        UserSetting.set(two_org_user, "default_org_id", newer_org.id.to_s)
        result = Mcp::IngestTokenExchangeService::Result.new(
          http_status: :created,
          body: { data: { ingestHost: "http://test.host", organizationId: newer_org.id.to_s, accounts: {} } }
        )
        expect(Mcp::IngestTokenExchangeService).to receive(:call).with(
          membership: newer_membership,
          tool_name: "claude_code",
          tools: nil,
          ingest_host: "http://test.host"
        ).and_return(result)

        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:created)
      end

      it "returns forbidden and does not call the service for an unrelated organization id" do
        other = create(:organization)
        expect(Mcp::IngestTokenExchangeService).not_to receive(:call)

        request.headers["X-Organization-ID"] = other.id.to_s
        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:forbidden)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("Forbidden")
        expect(parsed["message"]).to include("specified organization")
      end

      it "returns forbidden and does not call the service for a malformed organization id" do
        expect(Mcp::IngestTokenExchangeService).not_to receive(:call)

        request.headers["X-Organization-ID"] = "not-a-uuid"
        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:forbidden)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("Forbidden")
        expect(parsed["message"]).to include("specified organization")
      end

      it "returns forbidden and does not call the service for a blank organization id" do
        expect(Mcp::IngestTokenExchangeService).not_to receive(:call)

        request.headers["X-Organization-ID"] = "   "
        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:forbidden)
        parsed = JSON.parse(response.body)
        expect(parsed["error"]).to eq("Forbidden")
        expect(parsed["message"]).to include("specified organization")
      end
    end

    context "when the user has no organization membership" do
      let(:lonely_user) { create(:user) }

      before { authenticate_user(lonely_user) }

      it "returns forbidden and does not call the service" do
        expect(Mcp::IngestTokenExchangeService).not_to receive(:call)

        post :exchange, params: { tool_name: "claude_code" }

        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)["message"]).to include("No organization membership")
      end
    end
  end
end
