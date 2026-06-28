# frozen_string_literal: true

require "rails_helper"

RSpec.describe MetadataEnrichers::PrCorrelator do
  let(:connector) { create(:organization_connector, :github, :with_tokens) }
  let(:repository) { create(:repository, organization_connector: connector, full_name: "octocat/hello-world") }
  let(:commit_hash) { "abc123def456" }
  let(:api_url) { "https://api.github.com/repos/octocat/hello-world/commits/#{commit_hash}/pulls" }

  # Test env cache is :null_store — fetch would never cache and the
  # negative-cache assertions would pass for the wrong reason. Swap in a
  # real MemoryStore for these examples.
  around do |example|
    original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    example.run
  ensure
    Rails.cache = original_cache
  end

  describe ".call" do
    context "when the commit has an associated PR" do
      before do
        stub_request(:get, api_url).to_return(
          status: 200,
          body: [ { number: 42, html_url: "https://github.com/octocat/hello-world/pull/42", state: "merged" } ].to_json,
          headers: { "Content-Type" => "application/json" }
        )
      end

      it "returns pr_number, pr_url and pr_state of the first PR" do
        result = described_class.call(commit_hash: commit_hash, repository: repository)
        expect(result).to eq(pr_number: 42, pr_url: "https://github.com/octocat/hello-world/pull/42", pr_state: "merged")
      end

      it "keeps pr_number an Integer" do
        result = described_class.call(commit_hash: commit_hash, repository: repository)
        expect(result[:pr_number]).to be_an(Integer)
      end

      it "performs zero HTTP requests on a second call within the TTL (AC 11)" do
        described_class.call(commit_hash: commit_hash, repository: repository)
        result = described_class.call(commit_hash: commit_hash, repository: repository)

        expect(result[:pr_number]).to eq(42)
        expect(WebMock).to have_requested(:get, api_url).once
      end
    end

    context "when no PR is associated" do
      before do
        stub_request(:get, api_url).to_return(
          status: 200, body: "[]", headers: { "Content-Type" => "application/json" }
        )
      end

      it "returns pr_lookup_status not_found" do
        result = described_class.call(commit_hash: commit_hash, repository: repository)
        expect(result).to eq(pr_lookup_status: "not_found")
      end

      it "negative-caches the not_found result (AC 11)" do
        described_class.call(commit_hash: commit_hash, repository: repository)
        described_class.call(commit_hash: commit_hash, repository: repository)

        expect(WebMock).to have_requested(:get, api_url).once
      end
    end

    context "when the GitHub API errors" do
      it "propagates the error and does not cache it" do
        stub_request(:get, api_url).to_return(status: 502, body: "{}")

        expect {
          described_class.call(commit_hash: commit_hash, repository: repository)
        }.to raise_error(Oauth::GithubApiError)

        stub_request(:get, api_url).to_return(
          status: 200, body: "[]", headers: { "Content-Type" => "application/json" }
        )

        result = described_class.call(commit_hash: commit_hash, repository: repository)
        expect(result).to eq(pr_lookup_status: "not_found")
        expect(WebMock).to have_requested(:get, api_url).twice
      end
    end

    context "with distinct commits" do
      it "caches per (repository, commit_hash)" do
        other_url = "https://api.github.com/repos/octocat/hello-world/commits/fff999/pulls"
        stub_request(:get, api_url).to_return(status: 200, body: "[]", headers: { "Content-Type" => "application/json" })
        stub_request(:get, other_url).to_return(status: 200, body: "[]", headers: { "Content-Type" => "application/json" })

        described_class.call(commit_hash: commit_hash, repository: repository)
        described_class.call(commit_hash: "fff999", repository: repository)

        expect(WebMock).to have_requested(:get, api_url).once
        expect(WebMock).to have_requested(:get, other_url).once
      end
    end
  end
end
