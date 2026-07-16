require "rails_helper"

RSpec.describe Keycloak::JwtVerifier do
  describe ".fetch_jwks" do
    let(:jwks_uri) { "http://keycloak.test/realms/db90/protocol/openid-connect/certs" }
    let(:jwks_body) { { "keys" => [ { "kid" => "abc" } ] }.to_json }

    before do
      allow(Keycloak).to receive(:configuration).and_return(double(jwks_uri: jwks_uri))
      # Run the cache block instead of returning a cached value.
      allow(Rails.cache).to receive(:fetch) { |*_args, &block| block.call }
      # Don't actually sleep between retries.
      allow(described_class).to receive(:sleep)
    end

    def http_ok(body)
      response = Net::HTTPOK.new("1.1", "200", "OK")
      allow(response).to receive(:body).and_return(body)
      response
    end

    context "when Keycloak is unreachable" do
      it "retries the bounded number of times then raises UnavailableError" do
        expect(Net::HTTP).to receive(:start)
          .exactly(described_class::MAX_ATTEMPTS).times
          .and_raise(Errno::ECONNREFUSED)

        expect { described_class.fetch_jwks }
          .to raise_error(described_class::UnavailableError, /identity provider/i)
      end

      it "raises UnavailableError on a read timeout" do
        allow(Net::HTTP).to receive(:start).and_raise(Net::ReadTimeout)

        expect { described_class.fetch_jwks }.to raise_error(described_class::UnavailableError)
      end
    end

    context "when the first attempt fails but a retry succeeds" do
      it "returns the parsed JWKS without raising" do
        call = 0
        allow(Net::HTTP).to receive(:start) do
          call += 1
          raise Errno::ECONNREFUSED if call == 1
          http_ok(jwks_body)
        end

        expect(described_class.fetch_jwks).to eq(JSON.parse(jwks_body))
        expect(call).to eq(2)
      end
    end

    context "when Keycloak responds with a non-success status" do
      it "raises a plain VerificationError, not UnavailableError" do
        allow(Net::HTTP).to receive(:start).and_return(Net::HTTPBadRequest.new("1.1", "400", "Bad Request"))

        expect { described_class.fetch_jwks }.to raise_error(described_class::VerificationError) do |error|
          expect(error).not_to be_a(described_class::UnavailableError)
          expect(error.message).to match(/400/)
        end
      end
    end
  end
end
