require "rails_helper"

require_relative "../../../../../temporal/activities/get_policy_activity"
require_relative "../../../../../temporal/activities/sanitization_activity"
require_relative "../../../../../temporal/activities/persist_prompt_activity"

RSpec.describe Activities::PersistPromptActivity, type: :unit do
  subject(:activity) { described_class.new }

  let(:activity_context) { instance_double(Temporalio::Activity::Context, heartbeat: nil) }

  before do
    allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context)
    ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE")
    ENV.delete("INTERNAL_API_KEY")
  end

  after do
    ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE")
    ENV.delete("INTERNAL_API_KEY")
  end

  let(:tool_event_id) { SecureRandom.uuid }
  let(:occurred_at)   { Time.current.iso8601 }

  let(:sanitized_payload) do
    JSON.generate({
      "metadata" => {
        "prompt_text"    => "How do I reverse a string?",
        "assistant_text" => "You can use .reverse method."
      }
    })
  end

  let(:params) do
    {
      "tool_event_id" => tool_event_id,
      "occurred_at"   => occurred_at,
      "sanitization"  => { "sanitized_payload" => sanitized_payload },
      "policy"        => { "version" => 2 }
    }
  end

  context "when kill switch is OFF (default)" do
    it "returns captured: false without making an HTTP call" do
      expect(Net::HTTP).not_to receive(:new)

      result = activity.execute(params)
      expect(result["captured"]).to be false
    end
  end

  context "when kill switch is ON" do
    before { ENV["AIXLE_INSIGHTS_PROMPT_CAPTURE"] = "true" }

    context "when the sanitized payload has no prompt text" do
      let(:sanitized_payload) { JSON.generate({ "metadata" => {} }) }

      it "returns captured: false without making an HTTP call" do
        expect(Net::HTTP).not_to receive(:new)

        result = activity.execute(params)
        expect(result["captured"]).to be false
      end
    end

    context "when the sanitized payload contains prompt text" do
      it "POSTs to the internal event_texts endpoint" do
        stub_request(:post, %r{/api/internal/event_texts})
          .to_return(status: 201, body: { "data" => { "tool_event_id" => tool_event_id } }.to_json,
                     headers: { "Content-Type" => "application/json" })

        activity.execute(params)

        expect(WebMock).to have_requested(:post, %r{/api/internal/event_texts})
          .with(body: hash_including("event_text" => hash_including(
            "tool_event_id" => tool_event_id,
            "user_text"     => "How do I reverse a string?"
          )))
      end

      it "threads the policy version as sanitizer_version" do
        stub_request(:post, %r{/api/internal/event_texts})
          .to_return(status: 201, body: {}.to_json,
                     headers: { "Content-Type" => "application/json" })

        activity.execute(params)

        expect(WebMock).to have_requested(:post, %r{/api/internal/event_texts})
          .with(body: hash_including("event_text" => hash_including("sanitizer_version" => "2")))
      end

      it "does not raise when the HTTP call fails (capture error is non-fatal)" do
        stub_request(:post, %r{/api/internal/event_texts}).to_raise(Errno::ECONNREFUSED)

        expect { activity.execute(params) }.to raise_error(Errno::ECONNREFUSED)
      end

      it "posts redacted text from the real SanitizationActivity output (AC-11)" do
        raw_payload = {
          "metadata" => {
            "prompt_text" => "Email me at test@example.com and use key AKIAEXAMPLE123456789",
            "assistant_text" => "Call me at 555-123-4567"
          }
        }
        policy = Activities::GetPolicyActivity::DEFAULT_POLICY
        sanitization = Activities::SanitizationActivity.new.execute(
          "raw_payload" => raw_payload,
          "policy" => policy,
          "classification" => { "requires_sanitization" => true }
        )

        ac11_params = params.merge(
          "sanitization" => sanitization,
          "policy" => { "version" => policy["version"] }
        )

        stub_request(:post, %r{/api/internal/event_texts})
          .to_return(status: 201, body: {}.to_json,
                     headers: { "Content-Type" => "application/json" })

        activity.execute(ac11_params)

        expect(WebMock).to have_requested(:post, %r{/api/internal/event_texts})
          .with { |req|
            payload = JSON.parse(req.body)
            event_text = payload.fetch("event_text")
            expect(event_text.fetch("user_text")).to include("[REDACTED]")
            expect(event_text.fetch("assistant_text")).to include("[REDACTED]")
          }
      end
    end
  end
end
