# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin Content-Security-Policy (OWASP A05-4, AIX-371)", type: :request do
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

    it "sets a Permissions-Policy header" do
      expect(response.headers["Permissions-Policy"]).to include("camera=()", "microphone=()", "geolocation=()")
    end
  end

  shared_examples "the complete admin CSP" do
    it "sets the complete restrictive CSP" do
      csp = response.headers["Content-Security-Policy"]
      expect(csp).to be_present

      expect(csp).to include("default-src 'self'")
      expect(csp).to include("script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline'")
      expect(csp).to include("style-src 'self' https://fonts.googleapis.com 'unsafe-inline'")
      expect(csp).to include("font-src 'self' https://fonts.gstatic.com")
      expect(csp).to include("img-src 'self' data:")
      expect(csp).to include("object-src 'none'")
      expect(csp).to include("base-uri 'self'")
      expect(csp).to include("form-action 'self' #{Keycloak.configuration.external_url}")
      expect(csp).to include("frame-ancestors 'none'")
    end
  end

  describe "GET /admin (authenticated admin page)" do
    before do
      admin = create(:user, :global_admin)
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(admin)

      get admin_root_path
    end

    include_examples "the four flat security headers"
    include_examples "the complete admin CSP"
  end

  describe "GET /admin/login (normal, unauthenticated OIDC redirect)" do
    # No `notice`/`error` param — this is the normal public entry point QA can
    # reproduce without credentials, not the rendered error page.
    before { get admin_login_path }

    it "redirects to the configured Keycloak authorization endpoint" do
      expect(response).to have_http_status(:found)
      expect(response.headers["Location"]).to start_with(Keycloak.configuration.authorize_url)
    end

    include_examples "the four flat security headers"
    include_examples "the complete admin CSP"
  end
end
