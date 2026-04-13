# frozen_string_literal: true

class IssueSerializer < BaseSerializer
  attributes :id, :key, :summary, :status, :status_category, :issue_type, :priority,
             :assignee_id, :assignee_name, :reporter_name, :jira_project_key, :due_date, :labels

  datetime_attribute :external_created_at
  datetime_attribute :external_updated_at
  timestamps
end
