# frozen_string_literal: true

require "rails_helper"

RSpec.describe Oauth::SlackProvider, type: :service do
  let(:webhook_url) { "https://hooks.slack.com/services/T12345678/B12345678/EXAMPLE-WEBHOOK-SECRET" }
  let(:connector) { instance_double("OrganizationConnector", access_token: webhook_url) }
  let(:provider) { described_class.new(connector) }

  describe "#test_connection" do
    context "when the webhook URL is blank" do
      let(:connector) { instance_double("OrganizationConnector", access_token: "") }

      it "returns failure with a required message without making an HTTP call" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq("Webhook URL is required")
      end
    end

    context "when the webhook URL is nil" do
      let(:connector) { instance_double("OrganizationConnector", access_token: nil) }

      it "returns failure with a required message" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq("Webhook URL is required")
      end
    end

    context "when the webhook URL has the wrong domain" do
      let(:connector) { instance_double("OrganizationConnector", access_token: "https://hooks.example.com/services/T123/B123/abc") }

      it "returns failure with format error without making an HTTP call" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq("Invalid Slack webhook URL format")
      end
    end

    context "when the webhook URL is missing service path segments" do
      let(:connector) { instance_double("OrganizationConnector", access_token: "https://hooks.slack.com/services/T12345678") }

      it "returns failure with format error" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq("Invalid Slack webhook URL format")
      end
    end

    context "when the webhook URL uses http instead of https" do
      let(:connector) { instance_double("OrganizationConnector", access_token: "http://hooks.slack.com/services/T12345678/B12345678/abcdef") }

      it "returns failure with format error" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq("Invalid Slack webhook URL format")
      end
    end

    context "when the webhook URL is valid" do
      let(:faraday_response) { instance_double(Faraday::Response, success?: true) }

      before do
        allow(Faraday).to receive(:post).with(webhook_url).and_yield(double(headers: {}, body: nil)).and_return(faraday_response)
      end

      it "POSTs a test message to the webhook URL" do
        expect(Faraday).to receive(:post).with(webhook_url)

        provider.test_connection
      end

      it "returns success" do
        result = provider.test_connection

        expect(result[:success]).to be true
      end
    end

    context "when Slack returns a non-2xx response" do
      let(:faraday_response) { instance_double(Faraday::Response, success?: false, status: 403) }

      before do
        allow(Faraday).to receive(:post).with(webhook_url).and_yield(double(headers: {}, body: nil)).and_return(faraday_response)
      end

      it "returns failure with the HTTP status" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq("Slack webhook error (HTTP 403)")
      end
    end

    context "when a network error occurs" do
      before do
        allow(Faraday).to receive(:post).and_raise(Faraday::ConnectionFailed.new("connection refused"))
      end

      it "returns failure with a connection error message" do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include("Connection error")
      end
    end
  end
end
