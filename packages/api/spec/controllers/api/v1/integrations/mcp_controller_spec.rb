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
