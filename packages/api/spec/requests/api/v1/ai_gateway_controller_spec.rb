# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::AiGateway", type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: user, organization: organization, role: "admin")
  end

  describe "POLLING_ONLY_PROVIDERS deny-list" do
    context "when provider is anthropic (polling-only)" do
      before do
        create(:organization_connector, :anthropic, organization: organization, is_active: true)
      end

      it "returns 403 for POST chat" do
        authenticated_post(
          "/api/v1/ai/anthropic/organizations/#{organization.id}/chat",
          user: user,
          organization: organization,
          params: { messages: [ { role: "user", content: "hello" } ] }
        )

        expect_forbidden
        expect(json_error).to eq("Forbidden")
        expect(json_response[:message]).to include("usage polling only")
      end

      it "returns 403 for POST completions" do
        authenticated_post(
          "/api/v1/ai/anthropic/organizations/#{organization.id}/completions",
          user: user,
          organization: organization,
          params: { prompt: "hello" }
        )

        expect_forbidden
        expect(json_error).to eq("Forbidden")
      end

      it "does not reach Anthropic — no outbound HTTP call is made" do
        expect(Faraday).not_to receive(:new)
        expect(Net::HTTP).not_to receive(:new)

        authenticated_post(
          "/api/v1/ai/anthropic/organizations/#{organization.id}/chat",
          user: user,
          organization: organization,
          params: { messages: [ { role: "user", content: "hello" } ] }
        )
      end
    end

    context "when provider is openrouter (not polling-only)" do
      before do
        create(:organization_connector, organization: organization, connector_type: "openrouter", is_active: true)
        allow(Ai::ProxyService).to receive(:chat).and_return({
          id: "gen-123",
          model: "openai/gpt-4o",
          content: "response",
          finish_reason: "stop",
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.001 }
        })
      end

      it "is not blocked by the deny-list" do
        authenticated_post(
          "/api/v1/ai/openrouter/organizations/#{organization.id}/chat",
          user: user,
          organization: organization,
          params: { messages: [ { role: "user", content: "hello" } ] }
        )

        expect(response).not_to have_http_status(:forbidden)
      end
    end

    context "when no anthropic connector exists" do
      it "returns 403 before attempting any connector lookup" do
        authenticated_post(
          "/api/v1/ai/anthropic/organizations/#{organization.id}/chat",
          user: user,
          organization: organization,
          params: { messages: [ { role: "user", content: "hello" } ] }
        )

        expect_forbidden
      end
    end
  end
end
