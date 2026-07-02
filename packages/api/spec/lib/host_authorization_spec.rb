# frozen_string_literal: true

require_relative "../../config/host_authorization"

RSpec.describe Aixle::HostAuthorization do
  def with_env(**vars)
    original = vars.keys.to_h { |key| [ key.to_s, ENV.key?(key.to_s) ? ENV[key.to_s] : :missing ] }
    vars.each { |key, value| value.nil? ? ENV.delete(key.to_s) : ENV[key.to_s] = value }
    yield
  ensure
    original.each do |key, value|
      value == :missing ? ENV.delete(key) : ENV[key] = value
    end
  end

  describe ".resolved_api_host" do
    it "prefers API_HOST" do
      with_env("API_HOST" => "api.example.com", "APP_HOST" => nil, "FRONTEND_URL" => nil) do
        expect(described_class.resolved_api_host).to eq("api.example.com")
      end
    end

    it "falls back to APP_HOST" do
      with_env("API_HOST" => nil, "APP_HOST" => "staging.insights.example.com", "FRONTEND_URL" => nil) do
        expect(described_class.resolved_api_host).to eq("staging.insights.example.com")
      end
    end

    it "falls back to FRONTEND_URL host" do
      with_env("API_HOST" => nil, "APP_HOST" => nil, "FRONTEND_URL" => "https://staging.insights.example.com") do
        expect(described_class.resolved_api_host).to eq("staging.insights.example.com")
      end
    end
  end

  describe ".derive_base_domain" do
    it "strips the leftmost label for nested hostnames" do
      expect(described_class.derive_base_domain("staging.insights.example.com")).to eq("insights.example.com")
    end

    it "returns the host unchanged for apex-style names" do
      expect(described_class.derive_base_domain("example.com")).to eq("example.com")
    end
  end

  describe ".allowed_hosts" do
    it "includes the resolved api host and a subdomain regex" do
      with_env("API_HOST" => "staging.insights.example.com", "BASE_DOMAIN" => "insights.example.com") do
        hosts = described_class.allowed_hosts
        expect(hosts.first).to eq("staging.insights.example.com")
        expect(hosts[1]).to match("auth.insights.example.com")
        expect(hosts[1]).not_to match("malicious.evil.com")
      end
    end

    it "includes INTERNAL_API_HOST when set" do
      with_env("APP_HOST" => "staging.insights.example.com", "INTERNAL_API_HOST" => "api.staging-aixle-db90.local") do
        hosts = described_class.allowed_hosts
        expect(hosts).to include("api.staging-aixle-db90.local")
      end
    end

    it "omits INTERNAL_API_HOST when not set" do
      with_env("APP_HOST" => "staging.insights.example.com", "INTERNAL_API_HOST" => nil) do
        expect(described_class.allowed_hosts.length).to eq(2)
      end
    end
  end
end
