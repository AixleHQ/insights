# frozen_string_literal: true

require "rails_helper"

RSpec.describe SecurityHeaders do
  let(:app) { ->(_env) { [ 401, { "Content-Type" => "application/json" }, [ "{}" ] ] } }
  let(:middleware) { described_class.new(app) }

  it "adds all four missing headers" do
    _status, headers, _body = middleware.call({})

    expect(headers["X-Content-Type-Options"]).to eq("nosniff")
    expect(headers["X-Frame-Options"]).to eq("DENY")
    expect(headers["Referrer-Policy"]).to eq("strict-origin-when-cross-origin")
    expect(headers["Permissions-Policy"]).to include("camera=()", "microphone=()", "geolocation=()")
  end

  it "leaves status and body unchanged" do
    status, _headers, body = middleware.call({})

    expect(status).to eq(401)
    expect(body).to eq([ "{}" ])
  end

  it "preserves an existing canonically-cased header instead of overwriting it" do
    app = ->(_env) { [ 200, { "X-Frame-Options" => "SAMEORIGIN" }, [ "" ] ] }
    _status, headers, _body = described_class.new(app).call({})

    expect(headers["X-Frame-Options"]).to eq("SAMEORIGIN")
  end

  it "preserves an existing lower-cased header without adding a duplicate" do
    app = ->(_env) { [ 200, { "x-frame-options" => "SAMEORIGIN" }, [ "" ] ] }
    _status, headers, _body = described_class.new(app).call({})

    expect(headers["x-frame-options"]).to eq("SAMEORIGIN")
    expect(headers.keys.count { |k| k.casecmp?("X-Frame-Options") }).to eq(1)
  end

  it "does not add a Content-Security-Policy header" do
    _status, headers, _body = middleware.call({})

    expect(headers).not_to have_key("Content-Security-Policy")
  end

  describe "middleware stack ordering" do
    it "places SecurityHeaders before Rack::Cors and JwtAuth" do
      stack = Rails.application.middleware.map(&:klass)

      security_headers_index = stack.index(SecurityHeaders)
      cors_index = stack.index(Rack::Cors)
      jwt_auth_index = stack.index(JwtAuth)

      expect(security_headers_index).not_to be_nil
      expect(cors_index).not_to be_nil
      expect(jwt_auth_index).not_to be_nil
      expect(security_headers_index).to be < cors_index
      expect(security_headers_index).to be < jwt_auth_index
    end
  end
end
