# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::AnthropicProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'sk-ant-admin01-test123') }
  let(:provider) { described_class.new(connector) }

  describe "GET-only constraint" do
    it "does not use any mutating HTTP verb anywhere in the file" do
      source = File.read(Rails.root.join("app/services/oauth/anthropic_provider.rb"))
      expect(source).not_to match(/Faraday\.(post|put|patch|delete)/)
      expect(source).not_to match(/Net::HTTP::(Post|Put|Patch|Delete)/)
    end

    it "READ_ONLY_CONNECTION is a frozen Faraday connection" do
      connection = described_class.send(:const_get, :READ_ONLY_CONNECTION)
      expect(connection).to be_a(Faraday::Connection)
      expect(connection).to be_frozen
    end
  end

  describe "#fetch_usage" do
    let(:usage_url) { "https://api.anthropic.com/v1/organizations/usage_report/messages" }
    let(:start_date) { Date.new(2026, 4, 8) }
    let(:end_date) { Date.new(2026, 4, 15) }

    let(:single_page_response) do
      {
        "data" => [
          {
            "starting_at" => "2026-04-08T00:00:00Z",
            "ending_at" => "2026-04-09T00:00:00Z",
            "results" => [
              {
                "model" => "claude-sonnet-4-6",
                "uncached_input_tokens" => 50_000,
                "cache_read_input_tokens" => 10_000,
                "cache_creation" => {
                  "ephemeral_1h_input_tokens" => 5_000,
                  "ephemeral_5m_input_tokens" => 2_000
                },
                "output_tokens" => 15_000
              }
            ]
          }
        ],
        "has_more" => false
      }.to_json
    end

    context "when the API returns a single page of results" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: single_page_response, headers: { "Content-Type" => "application/json" })
      end

      it "returns one entry per model/day" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.length).to eq(1)
      end

      it "sets the correct external_id" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.first[:external_id]).to eq("anthropic-claude-sonnet-4-6-2026-04-08")
      end

      it "sums all input token types including cache_creation" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        # 50_000 uncached + 10_000 cache_read + 5_000 + 2_000 cache_creation
        expect(result.first[:tokens_in]).to eq(67_000)
      end

      it "maps output_tokens to tokens_out" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.first[:tokens_out]).to eq(15_000)
      end

      it "parses occurred_at from the bucket starting_at timestamp" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.first[:occurred_at]).to eq(Time.parse("2026-04-08T00:00:00Z"))
      end
    end

    context "when the API returns multiple pages" do
      let(:page1_response) do
        {
          "data" => [
            {
              "starting_at" => "2026-04-08T00:00:00Z",
              "ending_at" => "2026-04-09T00:00:00Z",
              "results" => [ { "model" => "claude-sonnet-4-6", "uncached_input_tokens" => 1_000, "cache_read_input_tokens" => 0, "output_tokens" => 500 } ]
            }
          ],
          "has_more" => true,
          "next_page" => "cursor_abc"
        }.to_json
      end

      let(:page2_response) do
        {
          "data" => [
            {
              "starting_at" => "2026-04-09T00:00:00Z",
              "ending_at" => "2026-04-10T00:00:00Z",
              "results" => [ { "model" => "claude-3-5-haiku", "uncached_input_tokens" => 2_000, "cache_read_input_tokens" => 0, "output_tokens" => 800 } ]
            }
          ],
          "has_more" => false
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_excluding("page"))
          .to_return(status: 200, body: page1_response, headers: { "Content-Type" => "application/json" })

        stub_request(:get, usage_url)
          .with(query: hash_including("page" => "cursor_abc"))
          .to_return(status: 200, body: page2_response, headers: { "Content-Type" => "application/json" })
      end

      it "fetches all pages and merges results" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.length).to eq(2)
        expect(result.map { |r| r[:model] }).to contain_exactly("claude-sonnet-4-6", "claude-3-5-haiku")
      end
    end

    context "when cache_creation contains non-token keys" do
      let(:response_with_extra_keys) do
        {
          "data" => [
            {
              "starting_at" => "2026-04-08T00:00:00Z",
              "ending_at" => "2026-04-09T00:00:00Z",
              "results" => [
                {
                  "model" => "claude-sonnet-4-6",
                  "uncached_input_tokens" => 10_000,
                  "cache_read_input_tokens" => 0,
                  "cache_creation" => {
                    "ephemeral_1h_input_tokens" => 5_000,
                    "some_future_non_token_key" => "not_a_number"
                  },
                  "output_tokens" => 5_000
                }
              ]
            }
          ],
          "has_more" => false
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 200, body: response_with_extra_keys, headers: { "Content-Type" => "application/json" })
      end

      it "only sums keys ending in _tokens" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.first[:tokens_in]).to eq(15_000)
      end
    end

    context "when the API returns a non-success status on page 1" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(status: 401, body: '{"error":"unauthorized"}')
      end

      it "returns nil" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result).to be_nil
      end
    end

    context "when the API fails mid-pagination (page 2 fails)" do
      let(:page1_response) do
        {
          "data" => [
            {
              "starting_at" => "2026-04-08T00:00:00Z",
              "ending_at" => "2026-04-09T00:00:00Z",
              "results" => [ { "model" => "claude-sonnet-4-6", "uncached_input_tokens" => 1_000, "cache_read_input_tokens" => 0, "output_tokens" => 500 } ]
            }
          ],
          "has_more" => true,
          "next_page" => "cursor_abc"
        }.to_json
      end

      before do
        stub_request(:get, usage_url)
          .with(query: hash_excluding("page"))
          .to_return(status: 200, body: page1_response, headers: { "Content-Type" => "application/json" })

        stub_request(:get, usage_url)
          .with(query: hash_including("page" => "cursor_abc"))
          .to_return(status: 500, body: '{"error":"server error"}')
      end

      it "returns partial results from successful pages" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result.length).to eq(1)
        expect(result.first[:model]).to eq("claude-sonnet-4-6")
      end
    end

    context "when a network error occurs" do
      before do
        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_raise(Faraday::ConnectionFailed.new("connection refused"))
      end

      it "returns nil" do
        result = provider.fetch_usage(start_date: start_date, end_date: end_date)

        expect(result).to be_nil
      end
    end
  end

  describe '#test_connection' do
    let(:usage_url) { 'https://api.anthropic.com/v1/organizations/usage_report/messages' }

    def stub_test_connection(status:, body: '{}')
      stub_request(:get, usage_url)
        .with(query: hash_including('bucket_width' => '1d'))
        .to_return(status: status, body: body, headers: { 'Content-Type' => 'application/json' })
    end

    context 'when the API key is not an Admin key (wrong prefix)' do
      let(:connector) { instance_double('OrganizationConnector', access_token: 'sk-ant-api03-EXAMPLE-workspace-key') }

      it 'returns failure without making an API call' do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Admin API key')
        expect(WebMock).not_to have_requested(:get, usage_url)
      end
    end

    context 'when the API key is blank' do
      let(:connector) { instance_double('OrganizationConnector', access_token: nil) }

      it 'returns failure without making an API call' do
        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Admin API key')
        expect(WebMock).not_to have_requested(:get, usage_url)
      end
    end

    context 'when the admin API key is valid' do
      it 'returns success' do
        stub_test_connection(status: 200, body: '{"data":[],"has_more":false}')

        result = provider.test_connection

        expect(result[:success]).to be true
      end
    end

    context 'when the API key is invalid (401)' do
      it 'returns failure with admin key guidance' do
        stub_test_connection(status: 401, body: '{"error":"unauthorized"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Admin API key')
      end
    end

    context 'when the API key is forbidden (403)' do
      it 'returns failure with admin key guidance' do
        stub_test_connection(status: 403, body: '{"error":"forbidden"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Admin API key')
      end
    end

    context 'when the API returns another error status' do
      it 'returns failure with status code in message' do
        stub_test_connection(status: 500)

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('500')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:get, usage_url)
          .with(query: hash_including('bucket_width' => '1d'))
          .to_raise(Faraday::ConnectionFailed.new('connection refused'))

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Connection error')
      end
    end
  end
end
