# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::OpenrouterTraces", type: :request do
  let(:organization) { create(:organization) }

  let(:connector) do
    create(:organization_connector,
      organization: organization,
      connector_type: "openrouter",
      access_token: "or-management-key-test-12345",
      is_active: true,
      webhook_active: true)
  end

  let(:webhook_token) { connector.webhook_token }

  let(:valid_payload) do
    {
      resourceSpans: [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "abc123def456abc1",
                  spanId: "span001",
                  name: "chat",
                  startTimeUnixNano: "1746355200000000000",
                  endTimeUnixNano: "1746355202000000000",
                  attributes: [
                    { key: "gen_ai.request.model", value: { stringValue: "openai/gpt-4o" } },
                    { key: "gen_ai.usage.prompt_tokens", value: { intValue: 150 } },
                    { key: "gen_ai.usage.completion_tokens", value: { intValue: 75 } },
                    { key: "openrouter.generation.cost", value: { doubleValue: 0.00225 } },
                    { key: "gen_ai.openrouter.provider_name", value: { stringValue: "OpenAI" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  end

  def post_trace(token: webhook_token, payload: valid_payload, headers: {})
    post "/api/v1/webhooks/openrouter_traces/#{token}",
         params: payload.to_json,
         headers: { "Content-Type" => "application/json" }.merge(headers)
  end

  before { connector }

  describe "POST /api/v1/webhooks/openrouter_traces/:webhook_token" do
    context "when OpenRouter sends a test connection request" do
      it "returns 200 without enqueuing a job" do
        expect(OpenrouterTraceJob).not_to receive(:perform_async)

        post_trace(headers: { "X-Test-Connection" => "true" })

        expect(response).to have_http_status(:ok)
        expect(json_response[:received]).to be true
      end
    end

    context "with a valid payload and no HMAC secret" do
      it "returns 202 and enqueues OpenrouterTraceJob" do
        allow(OpenrouterTraceJob).to receive(:perform_async)

        post_trace

        expect(response).to have_http_status(:accepted)
        expect(json_response[:received]).to be true
        expect(OpenrouterTraceJob).to have_received(:perform_async)
      end

      it "passes connector_id and payload_json to the job" do
        allow(OpenrouterTraceJob).to receive(:perform_async)

        post_trace

        expect(OpenrouterTraceJob).to have_received(:perform_async) do |cid, payload_json|
          expect(cid).to eq(connector.id)
          expect(JSON.parse(payload_json)).to include("resourceSpans")
        end
      end
    end

    context "when the HMAC secret is set on the connector" do
      let(:secret) { "webhook-shared-secret" }

      before { connector.update!(webhook_secret: secret) }

      it "returns 202 when the secret header matches" do
        post "/api/v1/webhooks/openrouter_traces/#{webhook_token}",
             params: valid_payload.to_json,
             headers: {
               "Content-Type" => "application/json",
               "X-Webhook-Secret" => secret
             }

        expect(response).to have_http_status(:accepted)
      end

      it "returns 401 when the secret header is missing" do
        post_trace

        expect(response).to have_http_status(:unauthorized)
        expect(json_error).to eq("Invalid signature")
      end

      it "returns 401 when the secret header is wrong" do
        post_trace(headers: { "X-Webhook-Secret" => "wrong-secret" })

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when no connector matches the webhook_token" do
      it "returns 200 so OpenRouter does not retry" do
        post_trace(token: "unknown-token-that-does-not-exist")

        expect(response).to have_http_status(:ok)
        expect(json_response[:received]).to be true
      end

      it "does not enqueue a job" do
        expect(OpenrouterTraceJob).not_to receive(:perform_async)

        post_trace(token: "unknown-token-that-does-not-exist")
      end

      # AIX-716. The 64-char canary matters: the previous log line wrote
      # params[:webhook_token]&.first(8), so an 8-char assertion needs a token long
      # enough for a prefix to be distinguishable from the whole value.
      let(:canary_token) { "CANARY716".ljust(64, "a") }

      it "logs no part of the token, and correlates on the request id instead" do
        logged = []
        allow(Rails.logger).to receive(:warn) { |message| logged << message.to_s }

        post_trace(token: canary_token)

        line = logged.find { |message| message.include?("[OpenrouterTraces]") }

        expect(line).to be_present
        expect(line).not_to include(canary_token)
        expect(line).not_to include(canary_token.first(8))
        # Matched, not `include("request_id=")` — that substring is present even when
        # request_id is nil, so the weaker form cannot fail for the reason it exists.
        expect(line).to match(/request_id=[0-9a-f-]{8,}/)

        # The response contract this change must not disturb: 200 so OpenRouter
        # does not retry an unknown-token payload.
        expect(response).to have_http_status(:ok)
        expect(json_response[:received]).to be true
      end
    end

    context "when the payload is malformed JSON" do
      it "returns 400" do
        post "/api/v1/webhooks/openrouter_traces/#{webhook_token}",
             params: "not-valid-json{{{",
             headers: { "Content-Type" => "application/json" }

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "when the connector is inactive" do
      before { connector.update!(is_active: false) }

      it "returns 200 without enqueuing a job" do
        expect(OpenrouterTraceJob).not_to receive(:perform_async)

        post_trace

        expect(response).to have_http_status(:ok)
      end
    end
  end
end
