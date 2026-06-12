# frozen_string_literal: true

# Enriches a freshly created commit event with the pull request it belongs
# to, looked up via the repository's GitHub connector (AIX-261). Enqueued
# from ToolEvents::Upsert after create; safe to re-run — lookups are cached
# and metadata merges are additive.
class PrCorrelationJob < ApplicationJob
  queue_as :default

  # Enqueued inside the upsert transaction — wait for commit so a fast
  # worker can't hit RecordNotFound on a not-yet-visible row.
  self.enqueue_after_transaction_commit = true

  discard_on ActiveRecord::RecordNotFound
  # A connector whose token can't be refreshed won't heal on the default
  # retry schedule; transient GitHub failures get a bounded retry instead
  # of weeks of hammering (review decision D3). TokenRefreshError is declared
  # by string: it lives in oauth/base_provider.rb, not in a file of its own,
  # so a direct constant reference here would crash autoloading.
  discard_on "Oauth::TokenRefreshError"
  retry_on Oauth::GithubApiError, wait: :polynomially_longer, attempts: 5

  def perform(tool_event_id)
    event = ToolEvent.find(tool_event_id)
    metadata = event.metadata || {}

    commit_hash = metadata["commit_hash"].presence || metadata["sha"].presence
    return if commit_hash.blank?
    return unless commit_hash.to_s.match?(Oauth::GithubProvider::COMMIT_SHA_PATTERN)

    repository = resolve_repository(event)
    if repository.nil?
      merge_metadata!(event, "pr_lookup_status" => "no_repo_link")
      return
    end

    result = MetadataEnrichers::PrCorrelator.call(commit_hash: commit_hash, repository: repository)
    merge_metadata!(event, result.stringify_keys)
  end

  private

  # First GitHub-connected repository along the resolution chain — a
  # non-GitHub repo earlier in the chain must not mask a GitHub one
  # (review decision D2).
  def resolve_repository(event)
    candidates(event).find { |repo| repo&.organization_connector&.connector_type == "github" }
  end

  def candidates(event)
    list = []
    list << event.repository if event.repository_id.present?

    project = event.project
    return list if project.nil?

    list.concat(project.repositories.order(:id).to_a)
    list << repository_by_git_remote(project)
    list
  end

  # Projects without synced Repository rows may still name the same repo via
  # git_remote_url — match its <owner>/<repo> path against Repository.full_name
  # within the event's organization.
  def repository_by_git_remote(project)
    path = Project.git_remote_path(project.git_remote_url)
    return nil if path.blank?

    Repository
      .joins(:organization_connector)
      .where(organization_connectors: { organization_id: project.organization_id })
      .where("LOWER(repositories.full_name) = ?", path.downcase)
      .first
  end

  def merge_metadata!(event, new_keys)
    event.with_lock do
      event.update!(metadata: (event.metadata || {}).merge(new_keys))
    end
  end
end
