# frozen_string_literal: true

require "rails_helper"

RSpec.describe Oauth::CursorProvider do
  let(:organization) { create(:organization) }
  let(:connector) do
    create(:organization_connector, :cursor, organization: organization,
           access_token: "test_cursor_api_key")
  end
  let(:provider) { described_class.new(connector) }

  let(:expected_auth_header) do
    "Basic #{Base64.strict_encode64("test_cursor_api_key:")}"
  end

  describe "#test_connection" do
    it "returns success when /teams/members returns 200" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .with(headers: { "Authorization" => expected_auth_header })
        .to_return(status: 200, body: '{"teamMembers":[]}', headers: { "Content-Type" => "application/json" })

      result = provider.test_connection
      expect(result).to eq({ success: true })
    end

    it "returns failure with error message on 401" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(status: 401, body: '{"error":"unauthorized"}')

      result = provider.test_connection
      expect(result[:success]).to be false
      expect(result[:error]).to match(/Invalid or unauthorised/)
    end

    it "returns failure on 403" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(status: 403, body: '{"error":"forbidden"}')

      result = provider.test_connection
      expect(result[:success]).to be false
    end

    it "returns failure on unexpected status" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(status: 500, body: "internal error")

      result = provider.test_connection
      expect(result[:success]).to be false
      expect(result[:error]).to include("HTTP 500")
    end

    it "returns failure on connection error" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_raise(Faraday::ConnectionFailed.new("connection refused"))

      result = provider.test_connection
      expect(result[:success]).to be false
      expect(result[:error]).to include("Connection error")
    end
  end

  describe "#fetch_seats" do
    let(:members_response) do
      {
        "teamMembers" => [
          { "name" => "Alice", "email" => "alice@example.com", "isRemoved" => false },
          { "name" => "Bob",   "email" => "bob@example.com",   "isRemoved" => false },
          { "name" => "Carol", "email" => "carol@example.com", "isRemoved" => true }
        ]
      }.to_json
    end

    it "returns count of active members (excludes isRemoved)" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(status: 200, body: members_response, headers: { "Content-Type" => "application/json" })

      result = provider.fetch_seats
      expect(result[:seat_count]).to eq(2)
    end

    it "returns 0 when all members are removed" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(
          status: 200,
          body: '{"teamMembers":[{"name":"Old","email":"old@x.com","isRemoved":true}]}',
          headers: { "Content-Type" => "application/json" }
        )

      result = provider.fetch_seats
      expect(result[:seat_count]).to eq(0)
    end

    it "raises on API error" do
      stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(status: 401, body: '{"error":"unauthorized"}')

      expect { provider.fetch_seats }.to raise_error(RuntimeError, /HTTP 401/)
    end
  end

  describe "#fetch_spend" do
    context "with a single page of results" do
      let(:spend_response) do
        {
          "totalPages" => 1,
          "totalMembers" => 2,
          "subscriptionCycleStart" => 1_748_736_000_000,
          "teamMemberSpend" => [
            { "email" => "alice@example.com", "spendCents" => 350.5,  "overallSpendCents" => 2000.0, "fastPremiumRequests" => 150 },
            { "email" => "bob@example.com",   "spendCents" => 125.25, "overallSpendCents" => 1500.0, "fastPremiumRequests" => 80 }
          ]
        }.to_json
      end

      before do
        stub_request(:post, "https://api.cursor.com/teams/spend")
          .with(body: hash_including("page" => 1, "pageSize" => 100))
          .to_return(status: 200, body: spend_response, headers: { "Content-Type" => "application/json" })
      end

      it "sums spendCents as overage_spend_cents" do
        result = provider.fetch_spend
        expect(result[:overage_spend_cents]).to be_within(0.001).of(475.75)
      end

      it "sums overallSpendCents as overall_spend_cents" do
        result = provider.fetch_spend
        expect(result[:overall_spend_cents]).to be_within(0.001).of(3500.0)
      end

      it "sums fastPremiumRequests" do
        result = provider.fetch_spend
        expect(result[:fast_premium_requests]).to eq(230)
      end

      it "converts subscriptionCycleStart epoch ms to ISO8601" do
        result = provider.fetch_spend
        expect(result[:billing_cycle_start]).to match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)
      end

      it "exposes total_members for cross-check" do
        result = provider.fetch_spend
        expect(result[:total_members]).to eq(2)
      end

      it "preserves fractional cents (does not round)" do
        result = provider.fetch_spend
        expect(result[:overage_spend_cents]).to be_a(Float)
        expect(result[:overage_spend_cents]).not_to eq(result[:overage_spend_cents].round)
      end
    end

    context "with multiple pages" do
      let(:page1) do
        {
          "totalPages" => 2,
          "totalMembers" => 3,
          "subscriptionCycleStart" => 1_748_736_000_000,
          "teamMemberSpend" => [
            { "email" => "a@x.com", "spendCents" => 100.0, "overallSpendCents" => 500.0, "fastPremiumRequests" => 10 }
          ]
        }.to_json
      end

      let(:page2) do
        {
          "totalPages" => 2,
          "totalMembers" => 3,
          "subscriptionCycleStart" => 1_748_736_000_000,
          "teamMemberSpend" => [
            { "email" => "b@x.com", "spendCents" => 200.0, "overallSpendCents" => 800.0, "fastPremiumRequests" => 20 },
            { "email" => "c@x.com", "spendCents" => 50.0,  "overallSpendCents" => 200.0, "fastPremiumRequests" => 5 }
          ]
        }.to_json
      end

      before do
        stub_request(:post, "https://api.cursor.com/teams/spend")
          .with(body: hash_including("page" => 1)).to_return(status: 200, body: page1, headers: { "Content-Type" => "application/json" })
        stub_request(:post, "https://api.cursor.com/teams/spend")
          .with(body: hash_including("page" => 2)).to_return(status: 200, body: page2, headers: { "Content-Type" => "application/json" })
      end

      it "accumulates spend across all pages" do
        result = provider.fetch_spend
        expect(result[:overage_spend_cents]).to be_within(0.001).of(350.0)
        expect(result[:overall_spend_cents]).to be_within(0.001).of(1500.0)
        expect(result[:fast_premium_requests]).to eq(35)
      end
    end

    context "when totalPages is 0 or absent (empty/new team)" do
      let(:empty_spend_response) do
        {
          "totalPages" => 0,
          "totalMembers" => 0,
          "subscriptionCycleStart" => 1_748_736_000_000,
          "teamMemberSpend" => []
        }.to_json
      end

      before do
        stub_request(:post, "https://api.cursor.com/teams/spend")
          .with(body: hash_including("page" => 1))
          .to_return(status: 200, body: empty_spend_response, headers: { "Content-Type" => "application/json" })
      end

      it "completes one iteration and returns zero spend without raising" do
        result = provider.fetch_spend
        expect(result[:overage_spend_cents]).to eq(0.0)
        expect(result[:total_members]).to eq(0)
        expect(result[:billing_cycle_start]).to be_present
      end
    end

    it "raises on API error" do
      stub_request(:post, "https://api.cursor.com/teams/spend")
        .to_return(status: 403, body: '{"error":"forbidden"}')

      expect { provider.fetch_spend }.to raise_error(RuntimeError, /HTTP 403/)
    end
  end

  describe "#test_connection and #fetch_seats share one HTTP call" do
    it "only calls /teams/members once when both are invoked on the same instance" do
      stub = stub_request(:get, "https://api.cursor.com/teams/members")
        .to_return(
          status: 200,
          body: '{"teamMembers":[{"name":"Alice","email":"alice@x.com","isRemoved":false}]}',
          headers: { "Content-Type" => "application/json" }
        )

      provider.test_connection
      provider.fetch_seats

      expect(stub).to have_been_requested.once
    end
  end
end
