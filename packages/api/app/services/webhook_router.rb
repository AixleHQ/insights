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
    return false unless job_class_name

    job_class = job_class_name.constantize
    options   = { event_type: event_type, raw_key: raw_key }
    options[:payload]     = payload if payload
    options[:delivery_id] = delivery_id if delivery_id

    if job_class < ActiveJob::Base
      job_class.perform_later(connector.id, "webhook", options)
    else
      job_class.perform_async(connector.id, "webhook", options)
    end
    true
  end
end
