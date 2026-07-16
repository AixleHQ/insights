require "rails_helper"

RSpec.describe Admin::KeycloakAuthService do
  subject(:service) { described_class.new }

  let(:token_url) { "http://keycloak.test/realms/db90/protocol/openid-connect/token" }

  before do
    allow(Keycloak).to receive(:configuration)
      .and_return(double(internal_token_url: token_url, audience: "db90-web"))
    # Don't actually sleep between connectivity retries.
    allow_any_instance_of(described_class).to receive(:sleep)
  end

  def http_response(klass, code, body)
    response = klass.new("1.1", code, "")
    allow(response).to receive(:body).and_return(body)
    response
  end

  describe "#authenticate" do
    context "when the Keycloak token endpoint is unreachable" do
      before do
        allow(Net::HTTP).to receive(:start).and_raise(Errno::ECONNREFUSED)
      end

      it "returns a 'temporarily unavailable' failure (distinct from a bad code)" do
        result = service.authenticate("code", "verifier", "http://app.test/admin/callback")

        expect(result.success?).to be(false)
        expect(result.error).to match(/temporarily unavailable/i)
      end

      it "does not attempt token verification" do
        expect(Keycloak::JwtVerifier).not_to receive(:verify)

        service.authenticate("code", "verifier", "http://app.test/admin/callback")
      end
    end

    context "when Keycloak rejects the authorization code" do
      before do
        allow(Net::HTTP).to receive(:start)
          .and_return(http_response(Net::HTTPBadRequest, "400", '{"error":"invalid_grant"}'))
      end

      it "returns a generic token-exchange failure" do
        result = service.authenticate("bad-code", "verifier", "http://app.test/admin/callback")

        expect(result.success?).to be(false)
        expect(result.error).to eq("Failed to obtain access token")
      end
    end

    context "when the exchange succeeds for a global admin" do
      let(:admin) { create(:user, :global_admin) }
      let(:token_body) { { "access_token" => "at", "expires_in" => 300 }.to_json }

      before do
        allow(Net::HTTP).to receive(:start).and_return(http_response(Net::HTTPOK, "200", token_body))
        # find_admin_user falls back to email lookup when keycloak_sub doesn't match.
        allow(Keycloak::JwtVerifier).to receive(:verify)
          .with("at").and_return({ "sub" => "kc-sub-unmatched", "email" => admin.email })
      end

      it "returns a successful result with the admin user" do
        result = service.authenticate("code", "verifier", "http://app.test/admin/callback")

        expect(result.success?).to be(true)
        expect(result.user).to eq(admin)
      end
    end
  end

  describe "#authorize_url" do
    before do
      allow(Keycloak).to receive(:configuration).and_return(
        double(
          audience: "db90-web",
          authorize_url: "http://keycloak.test/realms/db90/protocol/openid-connect/auth"
        )
      )
    end

    it "includes kc_idp_hint so Keycloak's native hosted login form never renders (AIX-568)" do
      url = service.authorize_url("http://app.test/admin/callback", "verifier")

      expect(url).to include("kc_idp_hint=google-dbp")
      expect(url).to include("client_id=db90-web")
      expect(url).to include("code_challenge_method=S256")
    end
  end
end
