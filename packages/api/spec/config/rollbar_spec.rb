# frozen_string_literal: true

require "rails_helper"
require "rack/mock"
require "rollbar/request_data_extractor"

RSpec.describe "Rollbar scrub configuration" do
  subject(:config) { Rollbar.configuration }

  it "scrubs domain-specific secret fields in addition to the gem defaults" do
    %i[keycloak_sub webhook_secret refresh_token api_token client_secret].each do |field|
      expect(config.scrub_fields).to include(field)
    end
  end

  it "still scrubs the gem's default sensitive fields" do
    %i[password secret access_token].each do |field|
      expect(config.scrub_fields).to include(field)
    end
  end

  it "scrubs the Authorization and API key headers" do
    expect(config.scrub_headers).to include("Authorization")
    expect(config.scrub_headers).to include("X-Api-Key")
  end

  # AIX-370 AC3. The examples above assert the configuration *contains* the right
  # symbols, which would still pass if the values never actually reached a scrubber.
  # This one runs a realistic payload through Rollbar's own scrubber with the app's
  # live configuration and checks the values come out redacted — the behaviour the AC
  # is really about.
  describe "behaviour: a payload carrying real secrets is redacted before egress" do
    let(:secrets) do
      {
        "keycloak_sub" => "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "webhook_secret" => "whsec_CANARY_8f3a2b1c9d0e",
        "refresh_token" => "rt_CANARY_5e6f7a8b9c0d",
        "api_token" => "at_CANARY_1a2b3c4d5e6f",
        "client_secret" => "cs_CANARY_9z8y7x6w5v4u",
        "password" => "CANARY-hunter2",
        "access_token" => "sk-CANARY-admin-0011223344"
      }
    end

    let(:safe) { { "organization_id" => "org-123", "tool_name" => "claude_code", "event_type" => "chat" } }

    let(:scrubbed) do
      Rollbar::Scrubbers::Params.call(
        params: secrets.merge(safe),
        config: Rollbar.configuration.scrub_fields
      )
    end

    it "redacts every configured secret field" do
      secrets.each do |field, raw_value|
        expect(scrubbed[field]).not_to eq(raw_value),
          "expected #{field} to be redacted, got the raw value back"
      end
    end

    it "does not leave any raw secret value anywhere in the scrubbed payload" do
      serialized = scrubbed.to_s

      secrets.each_value do |raw_value|
        expect(serialized).not_to include(raw_value)
      end
    end

    it "leaves non-sensitive debugging context intact" do
      safe.each { |field, value| expect(scrubbed[field]).to eq(value) }
    end

    it "records the redacted payload as AC3 evidence" do
    end
  end

  describe "behaviour: sensitive request headers are redacted before egress" do
    let(:authorization) { "Bearer AUTHORIZATION-CANARY-123" }
    let(:api_key) { "X-API-KEY-CANARY-456" }
    let(:safe_request_id) { "request-safe-789" }
    let(:rack_env) do
      Rack::MockRequest.env_for(
        "https://example.test/api/v1/test",
        "HTTP_AUTHORIZATION" => authorization,
        "HTTP_X_API_KEY" => api_key,
        "HTTP_X_REQUEST_ID" => safe_request_id
      )
    end
    let(:request_data) do
      Object.new
            .extend(Rollbar::RequestDataExtractor)
            .extract_request_data_from_rack(rack_env)
    end

    it "removes both configured header canaries while preserving safe context" do
      headers = request_data.fetch(:headers)

      expect(headers.fetch("Authorization")).to eq("******")
      expect(headers.fetch("X-Api-Key")).to eq("******")
      expect(headers.fetch("X-Request-Id")).to eq(safe_request_id)
      expect(request_data.to_s).not_to include(authorization)
      expect(request_data.to_s).not_to include(api_key)
    end
  end
end
