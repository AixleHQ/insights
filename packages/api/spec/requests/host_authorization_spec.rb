# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Host authorization", type: :request do
  describe "GET /up (Rails health check)" do
    context "with an unrecognized Host header" do
      it "returns 200 — excluded from host authorization" do
        get rails_health_check_path, headers: { "Host" => "malicious.evil.com" }
        expect(response).to have_http_status(:ok)
      end
    end

    context "with a recognized Host header" do
      it "returns 200" do
        get rails_health_check_path
        expect(response).to have_http_status(:ok)
      end
    end
  end

  describe "API endpoint" do
    context "with an unrecognized Host header" do
      it "returns 403 Forbidden (host authorization blocks the request)" do
        get "/api/v1/organizations", headers: { "Host" => "malicious.evil.com" }
        expect(response).to have_http_status(:forbidden)
      end
    end
  end
end
