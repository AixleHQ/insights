# frozen_string_literal: true

require "rails_helper"
require "rack/mock"
require "rollbar/request_data_extractor"

# AIX-716. Named for this ticket on purpose: develop has no
# spec/config/rollbar_spec.rb, staging has one (AIX-370) covering scrub_fields
# and scrub_headers, and the two files must not collide when the branches are
# reconciled.
#
# This spec drives Rollbar's real pipeline rather than asserting on configuration:
# a scrub_fields assertion would pass while request.url still leaked, because
# Rollbar::Scrubbers::URL never looks at path segments.
RSpec.describe "Rollbar redaction of the OpenRouter webhook token" do
  # Same length as OrganizationConnector#assign_webhook_token's SecureRandom.hex(32),
  # obviously planted so no reader mistakes it for a real credential.
  let(:canary) { "CANARY716".ljust(64, "a") }
  let(:path) { "/api/v1/webhooks/openrouter_traces/#{canary}" }

  let(:rack_env) do
    env = Rack::MockRequest.env_for(
      "https://staging.example.test#{path}",
      method: "POST",
      input: '{"resourceSpans":[]}',
      "CONTENT_TYPE" => "application/json"
    )
    # Rails sets this on every real request; Rack::MockRequest does not. Rollbar's
    # RequestDataExtractor#sensitive_params_list reads it, so without this line the
    # spec would report a params leak the production stack does not have.
    env["action_dispatch.parameter_filter"] = Rails.application.config.filter_parameters
    env
  end

  let(:extractor) { Object.new.extend(Rollbar::RequestDataExtractor) }

  let(:payload) do
    item = nil
    Rollbar.scoped(request: proc { extractor.extract_request_data_from_rack(rack_env) }) do
      # Private API, pinned to rollbar 3.7.0's 6-arg signature:
      # (level, message, exception, extra, context, is_uncaught). Guarded below.
      # Rollbar.error is not usable: config.enabled is false outside deployed envs,
      # so it would short-circuit before building anything.
      item = Rollbar.notifier.send(:build_item, "error", "AIX-716 canary probe", nil, {}, nil, false)
    end
    item.payload
  end

  let(:request_data) { payload.fetch("data").fetch(:request) }

  it "drives an API this rollbar version actually has (guards a gem bump)" do
    expect(Rollbar.notifier.method(:build_item).arity).to eq(6)
  end

  it "matched the real route, so the token genuinely reaches Rollbar's extractor" do
    # Without this, an unmatched route would return {} from recognize_path and every
    # assertion below would pass vacuously.
    raw = extractor.send(:rollbar_route_params, rack_env)

    expect(raw[:controller]).to eq("api/v1/openrouter_traces")
    expect(raw[:action]).to eq("receive")
    expect(raw[:webhook_token]).to eq(canary)
  end

  it "names webhook_token in scrub_fields" do
    # Configuration-only, and on its own insufficient — see the criterion 3 example.
    expect(Rollbar.configuration.scrub_fields).to include(:webhook_token)
  end

  it "registers at least one transform handler" do
    expect(Rollbar.configuration.transform).not_to be_empty
  end

  it "redacts webhook_token in the payload's request params" do
    observed = request_data[:params].inspect

    expect(request_data[:params][:webhook_token]).not_to eq(canary)
    expect(observed).not_to include(canary)
  end

  it "redacts the credential path segment from the payload's request.url" do
    observed = request_data[:url]

    expect(observed).not_to include(canary)
    expect(observed).not_to include(canary.first(8))
    expect(observed).to include(RollbarCredentialPathScrubber::PLACEHOLDER)
  end

  it "leaves no copy of the token anywhere in the payload it would transmit" do
    expect(payload.to_s).not_to include(canary)
  end

  it "leaves request.url for unrelated endpoints intact" do
    env = Rack::MockRequest.env_for("https://staging.example.test/api/v1/events", method: "GET")
    env["action_dispatch.parameter_filter"] = Rails.application.config.filter_parameters

    other = nil
    Rollbar.scoped(request: proc { extractor.extract_request_data_from_rack(env) }) do
      other = Rollbar.notifier.send(:build_item, "error", "control", nil, {}, nil, false)
    end

    expect(other.payload.fetch("data").fetch(:request)[:url])
      .to eq("https://staging.example.test/api/v1/events")
  end
end
