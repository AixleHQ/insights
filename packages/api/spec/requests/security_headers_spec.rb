# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Security headers", type: :request do
  shared_examples "the four flat security headers" do
    it "sets X-Content-Type-Options to nosniff" do
      expect(response.headers["X-Content-Type-Options"]).to eq("nosniff")
    end

    it "sets X-Frame-Options to DENY" do
      expect(response.headers["X-Frame-Options"]).to eq("DENY")
    end

    it "sets a restrictive Referrer-Policy" do
      expect(response.headers["Referrer-Policy"]).to eq("strict-origin-when-cross-origin")
    end

    it "sets a Permissions-Policy header that disables unused browser features" do
      expect(response.headers["Permissions-Policy"]).to include(
        "camera=()", "microphone=()", "geolocation=()", "usb=()", "payment=()"
      )
    end
  end

  describe "default Action Dispatch response (OWASP A05-4, AIX-371)" do
    before { get rails_health_check_path }

    include_examples "the four flat security headers"
  end

  describe "controller-rendered API response (no JWT, ingest-token auth)" do
    before do
      get "/api/v1/projects/lookup",
        params: { git_remote: "https://github.com/AixleHQ/insights.git" }
    end

    it "returns 401 from IngestTokenAuthentication" do
      expect(response).to have_http_status(:unauthorized)
    end

    include_examples "the four flat security headers"

    it "does not set a Content-Security-Policy header" do
      expect(response.headers["Content-Security-Policy"]).to be_nil
    end
  end

  describe "raw JwtAuth 401 response (decisive AC1 proof)" do
    before { get "/api/v1/users/me" }

    it "returns 401 identifying the missing authorization token" do
      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body["message"]).to eq("Missing authorization token")
    end

    include_examples "the four flat security headers"
  end
end
