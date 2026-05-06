# frozen_string_literal: true

class WebhookRouter
  JOB_REGISTRY = {
    "github"    => "GithubSyncJob",
    "gitlab"    => "GitlabSyncJob",
    "bitbucket" => "BitbucketSyncJob",
    "jira"      => "JiraSyncJob",
    "linear"    => "LinearSyncJob"
  }.freeze

  def self.dispatch(connector, event_type, raw_key, payload: nil, delivery_id: nil)
    job_class_name = JOB_REGISTRY[connector.connector_type]
    return unless job_class_name

    options = { event_type: event_type, raw_key: raw_key }
    options[:payload]     = payload     if payload
    options[:delivery_id] = delivery_id if delivery_id

    job_class_name.constantize.perform_later(connector.id, "webhook", options)
  end
end
