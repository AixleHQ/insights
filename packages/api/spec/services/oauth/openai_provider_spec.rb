# frozen_string_literal: true

require "rails_helper"

RSpec.describe Oauth::OpenaiProvider, type: :service do
  let(:connector) { instance_double("OrganizationConnector", access_token: "sk-admin-test123") }
  let(:provider) { described_class.new(connector) }
  let(:usage_url) { "https://api.openai.com/v1/organization/usage/completions" }

  describe "GET-only constraint" do
    it "does not use any mutating HTTP verb anywhere in the file" do
      source = File.read(Rails.root.join("app/services/oauth/openai_provider.rb"))
      expect(source).not_to match(/Faraday\.(post|put|patch|delete)/)
      expect(source).not_to match(/Net::HTTP::(Post|Put|Patch|Delete)/)
    end

    it "READ_ONLY_CONNECTION is a frozen Faraday connection" do
      connection = described_class.send(:const_get, :READ_ONLY_CONNECTION)
      expect(connection).to be_a(Faraday::Connection)
      expect(connection).to be_frozen
    end
  end

  describe "#test_connection" do
    def stub_test_connection(status:, body: "{}")
      stub_request(:get, usage_url)
        .with(query: hash_including("bucket_width" => "1d"))
        .to_return(status: status, body: body, headers: { "Content-Type" => "application/json" })
    end

    context "when the API key is valid" do
      it "returns success" do
        stub_test_connection(status: 200, body: '{"data":[]}')

        result = provider.test_connection

        expect(result[:success]).to be true
      end
    end

    context "when the API key is invalid (401)" do
      it "returns failure with admin key hint" do
        stub_test_connection(status: 401, body: '{"error":{"message":"invalid_api_key"}}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include("Org Admin API key")
        expect(result[:error]).to include("sk-admin-")
      end
    end

    context "when the API key is forbidden (403)" do
      it "returns failure with admin key hint" do
        stub_test_connection(status: 403, body: '{"error":"forbidden"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include("Org Admin API key")
      end
    end

    context "when the API returns another error status" do
      it "returns failure with status code in message" do
        stub_test_connection(status: 500)

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include("500")
      end
    end

    context "when a network error occurs" do
      it "returns failure with connection error message" do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_raise(Faraday::ConnectionFailed.new("connection refused"))

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include("Connection error")
      end
    end
  end

  describe "#fetch_usage" do
    let(:start_date) { Date.new(2026, 4, 8) }
    let(:end_date) { Date.new(2026, 4, 10) }

    let(:single_page_response) do
      {
        "data" => [
          {
            "start_time" => Time.utc(2026, 4, 8).to_i,
            "end_time" => Time.utc(2026, 4, 9).to_i,
            "results" => [
              {
                "model" => "gpt-4o",
                "input_tokens" => 1_000,
                "output_tokens" => 500,
                "input_cached_tokens" => 200,
                "input_audio_tokens" => 0,
                "output_audio_tokens" => 0,
                "num_model_requests" => 3
              }
            ]
          },
          {
            "start_time" => Time.utc(2026, 4, 9).to_i,
            "end_time" => Time.utc(2026, 4, 10).to_i,
            "results" => [
              {
                "model" => "gpt-4o-mini",
                "input_tokens" => 5_000,
                "output_tokens" => 2_000,
                "input_cached_tokens" => 0,
                "input_audio_tokens" => 0,
                "output_audio_tokens" => 0,
                "num_model_requests" => 10
              }
            ]
          }
        ],
        "has_more" => false,
        "next_page" => nil
      }.to_json
    end

    context "when the API returns a single page of results" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: single_page_response, headers: { "Content-Type" => "application/json" })
      end

      it "returns one entry per model/day bucket" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        expect(results.size).to eq(2)
      end

      it "folds input_cached_tokens into tokens_in" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        gpt4o = results.find { |r| r[:model] == "gpt-4o" }

        expect(gpt4o[:tokens_in]).to eq(1_200) # 1000 + 200
      end

      it "maps output_tokens to tokens_out" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        gpt4o = results.find { |r| r[:model] == "gpt-4o" }

        expect(gpt4o[:tokens_out]).to eq(500)
      end

      it "builds external_id as openai-{model}-{date}" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        gpt4o = results.find { |r| r[:model] == "gpt-4o" }

        expect(gpt4o[:external_id]).to eq("openai-gpt-4o-2026-04-08")
      end

      it "sets occurred_at from bucket start_time as UTC" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        gpt4o = results.find { |r| r[:model] == "gpt-4o" }

        expect(gpt4o[:occurred_at]).to be_within(1.second).of(Time.utc(2026, 4, 8))
      end

      it "sends exclusive end_time (end_date + 1 day) and limit=31" do
        provider.fetch_usage(start_date: start_date, end_date: end_date)

        expected_end = (end_date + 1.day).beginning_of_day.utc.to_i.to_s
        expect(WebMock).to have_requested(:get, usage_url)
          .with(query: hash_including("end_time" => expected_end, "limit" => "31"))
      end
    end

    context "when the API returns multiple pages" do
      let(:page1_response) do
        {
          "data" => [
            {
              "start_time" => Time.utc(2026, 4, 8).to_i,
              "results" => [ { "model" => "gpt-4o", "input_tokens" => 1_000, "output_tokens" => 500, "input_cached_tokens" => 0 } ]
            }
          ],
          "has_more" => true,
          "next_page" => "cursor-abc"
        }.to_json
      end

      let(:page2_response) do
        {
          "data" => [
            {
              "start_time" => Time.utc(2026, 4, 9).to_i,
              "results" => [ { "model" => "gpt-4o", "input_tokens" => 2_000, "output_tokens" => 800, "input_cached_tokens" => 0 } ]
            }
          ],
          "has_more" => false,
          "next_page" => nil
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_excluding("page"))
          .to_return(status: 200, body: page1_response, headers: { "Content-Type" => "application/json" })

        stub_request(:get, usage_url)
          .with(query: hash_including("page" => "cursor-abc"))
          .to_return(status: 200, body: page2_response, headers: { "Content-Type" => "application/json" })
      end

      it "follows next_page cursor and returns all results" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        expect(results.size).to eq(2)
        expect(WebMock).to have_requested(:get, /organization\/usage\/completions/).twice
      end
    end

    context "when the API returns a non-success status on page 1" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 403, body: '{"error":"forbidden"}')
      end

      it "returns nil and does not raise" do
        expect { provider.fetch_usage(start_date: start_date, end_date: end_date) }.not_to raise_error
        expect(provider.fetch_usage(start_date: start_date, end_date: end_date)).to be_nil
      end
    end

    context "when the API returns 401 on page 1" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 401, body: '{"error":"unauthorized"}')
      end

      it "returns nil and does not raise" do
        expect(provider.fetch_usage(start_date: start_date, end_date: end_date)).to be_nil
      end
    end

    context "when the API fails mid-pagination (page 2 fails)" do
      let(:page1_response) do
        {
          "data" => [
            {
              "start_time" => Time.utc(2026, 4, 8).to_i,
              "results" => [ { "model" => "gpt-4o", "input_tokens" => 1_000, "output_tokens" => 500, "input_cached_tokens" => 0 } ]
            }
          ],
          "has_more" => true,
          "next_page" => "cursor-abc"
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_excluding("page"))
          .to_return(status: 200, body: page1_response, headers: { "Content-Type" => "application/json" })

        stub_request(:get, usage_url)
          .with(query: hash_including("page" => "cursor-abc"))
          .to_return(status: 500, body: "{}")
      end

      it "returns partial results from successful pages" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        expect(results.size).to eq(1)
        expect(results.first[:model]).to eq("gpt-4o")
      end
    end

    context "when a bucket has an empty results array" do
      let(:empty_bucket_response) do
        {
          "data" => [ { "start_time" => Time.utc(2026, 4, 8).to_i, "results" => [] } ],
          "has_more" => false,
          "next_page" => nil
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: empty_bucket_response, headers: { "Content-Type" => "application/json" })
      end

      it "returns an empty array without raising" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        expect(results).to eq([])
      end
    end

    context "when an entry has a nil model" do
      let(:nil_model_response) do
        {
          "data" => [
            {
              "start_time" => Time.utc(2026, 4, 8).to_i,
              "results" => [
                { "model" => nil, "input_tokens" => 100, "output_tokens" => 50, "input_cached_tokens" => 0 },
                { "model" => "gpt-4o", "input_tokens" => 200, "output_tokens" => 100, "input_cached_tokens" => 0 }
              ]
            }
          ],
          "has_more" => false,
          "next_page" => nil
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: nil_model_response, headers: { "Content-Type" => "application/json" })
      end

      it "skips the nil-model entry and maps valid ones" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        expect(results.size).to eq(1)
        expect(results.first[:model]).to eq("gpt-4o")
      end
    end

    context "when a network error occurs on page 1" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_raise(Faraday::ConnectionFailed.new("connection refused"))
      end

      it "returns nil without raising" do
        expect(provider.fetch_usage(start_date: start_date, end_date: end_date)).to be_nil
      end
    end

    context "when the API responds 200 with invalid JSON" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: "not json", headers: { "Content-Type" => "application/json" })
      end

      it "returns nil without raising" do
        expect(provider.fetch_usage(start_date: start_date, end_date: end_date)).to be_nil
      end
    end

    context "when the API responds 200 with data: null" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: '{"data":null,"has_more":false}', headers: { "Content-Type" => "application/json" })
      end

      it "returns an empty array without raising" do
        expect(provider.fetch_usage(start_date: start_date, end_date: end_date)).to eq([])
      end
    end

    context "when MAX_PAGES is reached before has_more becomes false" do
      before do
        stub_const("Oauth::OpenaiProvider::MAX_PAGES", 1)
        stub_request(:get, usage_url)
          .with(query: hash_excluding("page"))
          .to_return(
            status: 200,
            body: {
              "data" => [
                {
                  "start_time" => Time.utc(2026, 4, 8).to_i,
                  "results" => [ { "model" => "gpt-4o", "input_tokens" => 500, "output_tokens" => 200, "input_cached_tokens" => 0 } ]
                }
              ],
              "has_more" => true,
              "next_page" => "cursor-more"
            }.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "stops at MAX_PAGES and returns results accumulated so far" do
        results = provider.fetch_usage(start_date: start_date, end_date: end_date)
        expect(results.size).to eq(1)
        expect(WebMock).to have_requested(:get, /completions/).once
      end
    end
  end
end
