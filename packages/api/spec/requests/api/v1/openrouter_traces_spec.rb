# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::OpenrouterTraces", type: :request do
  let(:organization) { create(:organization) }
  let(:access_token) { "or-management-key-test-12345" }
  let(:key_hash) { Digest::SHA256.hexdigest(access_token) }

  let(:connector) do
    create(:organization_connector,
      organization: organization,
      connector_type: "openrouter",
      access_token: access_token,
      is_active: true,
      webhook_active: true)
  end

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
                    { key: "gen_ai.openrouter.provider_name", value: { stringValue: "OpenAI" } },
                    { key: "openrouter.api_key_hash", value: { stringValue: key_hash } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  end

  def post_trace(payload: valid_payload, headers: {})
    post "/api/v1/webhooks/openrouter_traces",
         params: payload.to_json,
         headers: { "Content-Type" => "application/json" }.merge(headers)
  end

  before { connector }

  describe "POST /api/v1/webhooks/openrouter_traces" do
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

      it "returns 202 when the signature is valid" do
        body = valid_payload.to_json
        sig = OpenSSL::HMAC.hexdigest("SHA256", secret, body)

        post "/api/v1/webhooks/openrouter_traces",
             params: body,
             headers: {
               "Content-Type" => "application/json",
               "X-Openrouter-Signature" => sig
             }

        expect(response).to have_http_status(:accepted)
      end

      it "returns 401 when the signature is missing" do
        post_trace

        expect(response).to have_http_status(:unauthorized)
        expect(json_error).to eq("Invalid signature")
      end

      it "returns 401 when the signature is wrong" do
        post_trace(headers: { "X-Openrouter-Signature" => "bad-signature" })

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when no connector matches the key_hash" do
      let(:payload_unknown_key) do
        valid_payload.tap do |p|
          p[:resourceSpans][0][:scopeSpans][0][:spans][0][:attributes]
            .find { |a| a[:key] == "openrouter.api_key_hash" }[:value][:stringValue] = "unknown-hash"
        end
      end

      it "returns 200 so OpenRouter does not retry" do
        post_trace(payload: payload_unknown_key)

        expect(response).to have_http_status(:ok)
        expect(json_response[:received]).to be true
      end

      it "does not enqueue a job" do
        expect(OpenrouterTraceJob).not_to receive(:perform_async)

        post_trace(payload: payload_unknown_key)
      end
    end

    context "when the payload is malformed JSON" do
      it "returns 400" do
        post "/api/v1/webhooks/openrouter_traces",
             params: "not-valid-json{{{",
             headers: { "Content-Type" => "application/json" }

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "when no key_hash attribute is present in spans" do
      let(:payload_no_key_hash) do
        payload = valid_payload.deep_dup
        payload[:resourceSpans][0][:scopeSpans][0][:spans][0][:attributes]
          .reject! { |a| a[:key] == "openrouter.api_key_hash" }
        payload
      end

      it "returns 200 gracefully" do
        post_trace(payload: payload_no_key_hash)

        expect(response).to have_http_status(:ok)
      end
    end
  end
end
