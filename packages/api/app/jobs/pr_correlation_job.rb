# frozen_string_literal: true

# Enriches a freshly created commit event with the pull request it belongs
# to, looked up via the repository's GitHub connector (AIX-261). Enqueued
# from ToolEvents::Upsert after create; idempotent — the correlator caches
# lookups and the metadata merge is a no-op on re-run.
class PrCorrelationJob < ApplicationJob
  queue_as :default

  discard_on ActiveRecord::RecordNotFound

  def perform(tool_event_id)
    event = ToolEvent.find(tool_event_id)

    commit_hash = event.metadata["commit_hash"].presence || event.metadata["sha"].presence
    return if commit_hash.blank?

    repository = resolve_repository(event)
    unless repository&.organization_connector&.connector_type == "github"
      merge_metadata!(event, "pr_lookup_status" => "no_repo_link")
      return
    end

    result = MetadataEnrichers::PrCorrelator.call(commit_hash: commit_hash, repository: repository)
    merge_metadata!(event, result.stringify_keys)
  end

  private

  def resolve_repository(event)
    return event.repository if event.repository_id.present?

    project = event.project
    return nil if project.nil?

    project.repositories.first || repository_by_git_remote(project)
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
    event.update!(metadata: event.metadata.merge(new_keys))
  end
end
