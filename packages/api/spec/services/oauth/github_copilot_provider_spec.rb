# frozen_string_literal: true

require "rails_helper"

RSpec.describe Oauth::GithubCopilotProvider, type: :service do
  let(:org) { "acme" }
  let(:connector) do
    instance_double(
      "OrganizationConnector",
      access_token:       "ghs_token123",
      external_org_name:  org,
      token_expired?:     false
    )
  end
  let(:provider) { described_class.new(connector) }

  let(:billing_fixture) do
    JSON.parse(File.read(Rails.root.join("spec/fixtures/github_copilot_billing.json")))
  end

  let(:ai_credit_url) do
    "https://api.github.com/organizations/#{org}/settings/billing/ai_credit/usage"
  end

  let(:premium_req_url) do
    "https://api.github.com/organizations/#{org}/settings/billing/premium_request/usage"
  end

  describe "#fetch_billing_usage" do
    context "when ai_credit/usage returns data" do
      before do
        stub_request(:get, ai_credit_url)
          .to_return(
            status: 200,
            body: billing_fixture.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "returns aggregated org-level billing hash" do
        result = provider.fetch_billing_usage

        expect(result["metered_units_used"]).to eq(4500)
        expect(result["included_units"]).to eq(3000)
        expect(result["overage_units"]).to eq(1500)
        expect(result["overage_cost_usd"]).to eq(15.0)
      end

      it "sets billing_model to ai_credits" do
        result = provider.fetch_billing_usage
        expect(result["billing_model"]).to eq("ai_credits")
      end

      it "derives billing period from timePeriod" do
        result = provider.fetch_billing_usage
        expect(result["billing_period_start"]).to eq("2026-06-01")
        expect(result["billing_period_end"]).to eq("2026-06-30")
      end
    end

    context "when ai_credit/usage returns 404 and premium_request/usage has data" do
      before do
        stub_request(:get, ai_credit_url).to_return(status: 404, body: "")
        stub_request(:get, premium_req_url)
          .to_return(
            status: 200,
            body: billing_fixture.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "falls back and returns data with billing_model premium_requests" do
        result = provider.fetch_billing_usage
        expect(result["billing_model"]).to eq("premium_requests")
        expect(result["overage_cost_usd"]).to eq(15.0)
      end
    end

    context "when ai_credit/usage returns empty usageItems" do
      before do
        empty_body = { "timePeriod" => { "year" => 2026, "month" => 6 }, "usageItems" => [] }.to_json
        stub_request(:get, ai_credit_url)
          .to_return(status: 200, body: empty_body, headers: { "Content-Type" => "application/json" })
        stub_request(:get, premium_req_url)
          .to_return(
            status: 200,
            body: billing_fixture.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "falls back to premium_request/usage" do
        result = provider.fetch_billing_usage
        expect(result["billing_model"]).to eq("premium_requests")
      end
    end

    context "when both endpoints fail" do
      before do
        stub_request(:get, ai_credit_url).to_return(status: 404, body: "")
        stub_request(:get, premium_req_url).to_return(status: 403, body: "")
      end

      it "returns {}" do
        expect(provider.fetch_billing_usage).to eq({})
      end
    end

    context "when a Faraday error occurs" do
      before do
        stub_request(:get, ai_credit_url).to_raise(Faraday::ConnectionFailed.new("connection refused"))
        stub_request(:get, premium_req_url).to_raise(Faraday::ConnectionFailed.new("connection refused"))
      end

      it "returns {} without raising" do
        expect { provider.fetch_billing_usage }.not_to raise_error
        expect(provider.fetch_billing_usage).to eq({})
      end
    end

    context "when GitHub returns malformed JSON" do
      before do
        stub_request(:get, ai_credit_url).to_return(status: 200, body: "not-json")
        stub_request(:get, premium_req_url).to_return(status: 200, body: "not-json")
      end

      it "returns {} without raising so seat data is not lost" do
        expect { provider.fetch_billing_usage }.not_to raise_error
        expect(provider.fetch_billing_usage).to eq({})
      end
    end

    context "when seat count exceeds per-user cap" do
      before do
        stub_request(:get, ai_credit_url)
          .to_return(
            status: 200,
            body: billing_fixture.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "skips per-user billing and omits billing_by_user key" do
        logins = (1..201).map { |i| "user#{i}" }
        result = provider.fetch_billing_usage(seat_assignees: logins)
        expect(result).not_to have_key("billing_by_user")
      end
    end
  end

  describe "aggregate_usage_items (via fetch_billing_usage)" do
    it "sums across multiple usageItems" do
      stub_request(:get, ai_credit_url)
        .to_return(
          status: 200,
          body: billing_fixture.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      result = provider.fetch_billing_usage
      # fixture has two items: 3000+1500=4500 gross, 2000+1000=3000 discount, 1000+500=1500 net
      expect(result["metered_units_used"]).to eq(4500)
      expect(result["included_units"]).to eq(3000)
      expect(result["overage_units"]).to eq(1500)
      expect(result["overage_cost_usd"]).to eq(15.0) # 10.00 + 5.00
    end
  end
end
