# frozen_string_literal: true

require "rails_helper"

RSpec.describe "POST /api/internal/event_texts", type: :request do
  let(:tool_event_id) { SecureRandom.uuid }
  let(:occurred_at)   { Time.current.iso8601 }

  let(:valid_params) do
    {
      event_text: {
        tool_event_id: tool_event_id,
        occurred_at: occurred_at,
        user_text: "How do I sort a hash in Ruby?",
        assistant_text: "You can sort a hash by...",
        sanitizer_version: "v2"
      }
    }
  end

  def post_event_text(params: valid_params, api_key: nil)
    headers = { "Content-Type" => "application/json" }
    headers["Authorization"] = "Bearer #{api_key}" if api_key
    post "/api/internal/event_texts", params: params.to_json, headers: headers
  end

  context "with INTERNAL_API_KEY set" do
    let(:api_key) { "test-internal-key" }

    before { ENV["INTERNAL_API_KEY"] = api_key }
    after  { ENV.delete("INTERNAL_API_KEY") }

    it "returns 401 when no auth header" do
      post_event_text
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 when wrong key" do
      post_event_text(api_key: "wrong-key")
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "without INTERNAL_API_KEY (auth skipped)" do
    before { ENV.delete("INTERNAL_API_KEY") }

    context "when kill switch is OFF (default)" do
      before { ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE") }
      after  { ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE") }

      it "returns 200 with captured: false and no DB row" do
        post_event_text
        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["captured"]).to be false
        expect(EventText.count).to eq(0)
      end
    end

    context "when kill switch is ON" do
      before { ENV["AIXLE_INSIGHTS_PROMPT_CAPTURE"] = "true" }
      after  { ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE") }

      it "returns 201 and persists the event_text row" do
        post_event_text
        expect(response).to have_http_status(:created)
        expect(EventText.count).to eq(1)

        row = EventText.find_by(tool_event_id: tool_event_id, occurred_at: Time.iso8601(occurred_at))
        expect(row.user_text).to eq("How do I sort a hash in Ruby?")
        expect(row.sanitizer_version).to eq("v2")
      end

      it "returns composite id in response" do
        post_event_text
        data = JSON.parse(response.body)["data"]
        expect(data["tool_event_id"]).to eq(tool_event_id)
        expect(Time.iso8601(data["occurred_at"]).utc.iso8601).to eq(Time.iso8601(occurred_at).utc.iso8601)
      end

      it "returns 200 with captured: false when both texts are blank" do
        params = valid_params.deep_merge(event_text: { user_text: nil, assistant_text: nil })
        post_event_text(params: params)
        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["captured"]).to be false
      end
    end
  end
end
