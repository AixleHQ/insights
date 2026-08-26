# frozen_string_literal: true

require "rails_helper"

# AIX-716. This module is a security control invoked from Rollbar's
# `config.transform` loop, which swallows any exception it raises, logs it, and
# then BREAKS out of the handler list (rollbar-3.7.0 lib/rollbar/item.rb:295-307)
# — leaving the unredacted payload in place. So "does not raise" is a security
# assertion here, not defensive-programming hygiene.
RSpec.describe RollbarCredentialPathScrubber do
  let(:canary) { "CANARY716".ljust(64, "a") }
  let(:leaking_url) { "https://staging.example.test/api/v1/webhooks/openrouter_traces/#{canary}" }
  let(:redacted_url) { "https://staging.example.test/api/v1/webhooks/openrouter_traces/[FILTERED]" }

  def payload_with(url, data_key: "data", request_key: :request, url_key: :url)
    { data_key => { request_key => { url_key => url } } }
  end

  describe ".redact" do
    it "replaces the credential path segment with the placeholder" do
      expect(described_class.redact(leaking_url)).to eq(redacted_url)
    end

    it "leaves no part of the token behind" do
      expect(described_class.redact(leaking_url)).not_to include(canary)
      expect(described_class.redact(leaking_url)).not_to include(canary.first(8))
    end

    it "is idempotent, so a second transform pass cannot corrupt the URL" do
      once = described_class.redact(leaking_url)

      expect(described_class.redact(once)).to eq(once)
    end

    it "preserves a query string, so Rollbar's own query scrubbing still applies" do
      result = described_class.redact("#{leaking_url}?trace=abc")

      expect(result).to eq("#{redacted_url}?trace=abc")
    end

    it "does not touch URLs for other endpoints" do
      other = "https://staging.example.test/api/v1/events?token=abc"

      expect(described_class.redact(other)).to eq(other)
    end
  end

  describe ".call" do
    it "redacts the URL in a symbol-keyed payload" do
      payload = payload_with(leaking_url)

      described_class.call(payload: payload)

      expect(payload["data"][:request][:url]).to eq(redacted_url)
    end

    it "redacts the URL in a string-keyed payload" do
      payload = payload_with(leaking_url, request_key: "request", url_key: "url")

      described_class.call(payload: payload)

      expect(payload["data"]["request"]["url"]).to eq(redacted_url)
    end

    it "redacts the URL when the top-level data key is a symbol" do
      payload = payload_with(leaking_url, data_key: :data)

      described_class.call(payload: payload)

      expect(payload[:data][:request][:url]).to eq(redacted_url)
    end

    # Each of these would raise from a naive implementation. A raise means the
    # real payload ships unredacted, so every one is a security case.
    [
      [ "an empty options hash", {} ],
      [ "a nil payload", { payload: nil } ],
      [ "a payload that is not a Hash", { payload: "boom" } ],
      [ "a nil data node", { payload: { "data" => nil } } ],
      [ "a request node that is not a Hash", { payload: { "data" => { request: "boom" } } } ],
      [ "a missing request node", { payload: { "data" => { body: {} } } } ],
      [ "a nil url", { payload: { "data" => { request: { url: nil } } } } ],
      [ "a non-String url", { payload: { "data" => { request: { url: 42 } } } } ]
    ].each do |description, options|
      it "does not raise on #{description}" do
        expect { described_class.call(options) }.not_to raise_error
      end
    end

    it "does not raise when handed no options hash at all" do
      expect { described_class.call(nil) }.not_to raise_error
    end
  end
end
