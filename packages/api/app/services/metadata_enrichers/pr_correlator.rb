# frozen_string_literal: true

module MetadataEnrichers
  # Resolves the pull request associated with a commit via the repository's
  # GitHub connector (AIX-261). Results — including "not found" — are
  # cached for CACHE_TTL to bound GitHub API usage; provider errors propagate
  # uncached so Sidekiq retries can succeed later.
  class PrCorrelator
    CACHE_TTL = 6.hours

    # @return [Hash] { pr_number:, pr_url:, pr_state: } for the first
    #   associated PR, or { pr_lookup_status: "not_found" }
    def self.call(commit_hash:, repository:)
      Rails.cache.fetch("pr_correlation/#{repository.id}/#{commit_hash}", expires_in: CACHE_TTL) do
        provider = Oauth::BaseProvider.for(repository.organization_connector)
        pulls = provider.fetch_pull_requests_for_commit(repository.full_name, commit_hash)

        if pulls.empty?
          { pr_lookup_status: "not_found" }
        else
          first = pulls.first
          { pr_number: first["number"], pr_url: first["html_url"], pr_state: first["state"] }
        end
      end
    end
  end
end
