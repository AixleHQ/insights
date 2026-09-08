# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::AiGateway", type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: user, organization: organization, role: "owner")
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

  describe "error responses do not echo upstream error text" do
    before do
      create(:organization_connector, organization: organization, connector_type: "openrouter", is_active: true)
    end

    SENSITIVE_UPSTREAM_MESSAGE = "upstream failure at host=ai-internal-01.prod.vendor.local request_id=req_9f8a7"

    {
      "chat" => "chat",
      "completion" => "completions"
    }.each do |proxy_method, action|
      context "for POST #{action}" do
        it "returns a generic message and logs only safe metadata for RateLimitError" do
          logged = []
          allow(Ai::ProxyService).to receive(proxy_method.to_sym).and_raise(
            Ai::RateLimitError.new(SENSITIVE_UPSTREAM_MESSAGE, status: 429, provider: "openrouter")
          )
          allow(Rails.logger).to receive(:error) { |message| logged << message }

          authenticated_post(
            "/api/v1/ai/openrouter/organizations/#{organization.id}/#{action}",
            user: user,
            organization: organization,
            params: action == "chat" ? { messages: [ { role: "user", content: "hi" } ] } : { prompt: "hi" }
          )

          expect(response).to have_http_status(:too_many_requests)
          expect(json_response[:message]).to eq("Too many requests to the AI provider. Please try again later.")
          expect(json_response[:message]).not_to include("ai-internal-01")
          expect(json_response[:message]).not_to include("req_9f8a7")

          gateway_log = logged.find { |message| message.include?("[AiGateway]") }
          expect(gateway_log).to include("provider=openrouter", "status=429", "class=Ai::RateLimitError")
          expect(gateway_log).not_to include(SENSITIVE_UPSTREAM_MESSAGE)
        end

        it "returns a generic message for AuthenticationError" do
          allow(Ai::ProxyService).to receive(proxy_method.to_sym).and_raise(
            Ai::AuthenticationError.new(SENSITIVE_UPSTREAM_MESSAGE, status: 401, provider: "openrouter")
          )
          allow(Rails.logger).to receive(:error)

          authenticated_post(
            "/api/v1/ai/openrouter/organizations/#{organization.id}/#{action}",
            user: user,
            organization: organization,
            params: action == "chat" ? { messages: [ { role: "user", content: "hi" } ] } : { prompt: "hi" }
          )

          expect(response).to have_http_status(:unauthorized)
          expect(json_response[:message]).to eq("Authentication with the AI provider failed.")
        end

        it "returns a generic message for InvalidRequestError" do
          allow(Ai::ProxyService).to receive(proxy_method.to_sym).and_raise(
            Ai::InvalidRequestError.new(SENSITIVE_UPSTREAM_MESSAGE, status: 400, provider: "openrouter")
          )
          allow(Rails.logger).to receive(:error)

          authenticated_post(
            "/api/v1/ai/openrouter/organizations/#{organization.id}/#{action}",
            user: user,
            organization: organization,
            params: action == "chat" ? { messages: [ { role: "user", content: "hi" } ] } : { prompt: "hi" }
          )

          expect(response).to have_http_status(:bad_request)
          expect(json_response[:message]).to eq("The AI provider rejected the request.")
        end

        it "returns a generic message for the base ApiError" do
          allow(Ai::ProxyService).to receive(proxy_method.to_sym).and_raise(
            Ai::ApiError.new(SENSITIVE_UPSTREAM_MESSAGE, status: 502, provider: "openrouter")
          )
          allow(Rails.logger).to receive(:error)

          authenticated_post(
            "/api/v1/ai/openrouter/organizations/#{organization.id}/#{action}",
            user: user,
            organization: organization,
            params: action == "chat" ? { messages: [ { role: "user", content: "hi" } ] } : { prompt: "hi" }
          )

          expect(response).to have_http_status(:bad_gateway)
          expect(json_response[:message]).to eq("The AI provider is currently unavailable. Please try again later.")
        end
      end
    end

    it "returns a generic message for AuthenticationError on GET models" do
      allow(Ai::ProxyService).to receive(:list_models).and_raise(
        Ai::AuthenticationError.new(SENSITIVE_UPSTREAM_MESSAGE, status: 401, provider: "openrouter")
      )
      allow(Rails.logger).to receive(:error)

      authenticated_get(
        "/api/v1/ai/openrouter/organizations/#{organization.id}/models",
        user: user,
        organization: organization
      )

      expect(response).to have_http_status(:unauthorized)
      expect(json_response[:message]).to eq("Authentication with the AI provider failed.")
    end
  end
end
