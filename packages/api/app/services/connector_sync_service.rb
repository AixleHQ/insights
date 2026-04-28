# frozen_string_literal: true

class ConnectorSyncService
  def self.enqueue(connector)
    case connector.connector_type
    when "github"    then GithubSyncJob.perform_later(connector.id)
    when "gitlab"    then GitlabSyncJob.perform_later(connector.id)
    when "bitbucket" then BitbucketSyncJob.perform_later(connector.id)
    when "jira"      then JiraSyncJob.perform_later(connector.id, "sync")
    end
  end
end
