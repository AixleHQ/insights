# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProxyAware do
  let(:host_class) do
    Class.new do
      include ProxyAware
      attr_accessor :request
      public :external_origin
    end
  end
  let(:instance) { host_class.new }

  def fake_request(headers: {}, scheme: "http", host_with_port: "localhost:3000")
    instance_double(ActionDispatch::Request, headers: headers, scheme: scheme, host_with_port: host_with_port)
  end

  describe "#external_origin" do
    context "in development/test" do
      it "builds the origin from X-Forwarded-* headers when present" do
        instance.request = fake_request(headers: { "X-Forwarded-Proto" => "https", "X-Forwarded-Host" => "proxy.local" })

        expect(instance.external_origin).to eq("https://proxy.local")
      end

      it "falls back to the request's own scheme/host when no forwarded headers are present" do
        instance.request = fake_request(headers: {}, scheme: "http", host_with_port: "localhost:3000")

        expect(instance.external_origin).to eq("http://localhost:3000")
      end
    end

    context "in staging/production" do
      before { allow(Rails.env).to receive(:production?).and_return(true) }

      it "pins to APP_HOST and ignores a spoofed X-Forwarded-Host" do
        allow(ENV).to receive(:fetch).with("APP_HOST").and_return("insights.example.com")
        instance.request = fake_request(headers: { "X-Forwarded-Host" => "evil.example.com", "X-Forwarded-Proto" => "http" })

        expect(instance.external_origin).to eq("https://insights.example.com")
      end
    end
  end
end
