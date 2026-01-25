class DailyTokenUsage < ApplicationRecord
  self.table_name = 'timeseries.daily_token_usage'
  self.primary_key = nil

  belongs_to :organization
  belongs_to :user
  belongs_to :project, optional: true

  scope :in_range, ->(start_time, end_time) { where(bucket: start_time..end_time) }
  scope :for_organization, ->(org) { where(organization: org) }
  scope :for_user, ->(user) { where(user: user) }
  scope :for_project, ->(project) { where(project: project) }
  scope :by_tool, ->(tool) { where(tool_name: tool) }

  def self.total_tokens_for_organization(org, start_time, end_time)
    for_organization(org).in_range(start_time, end_time).sum(:total_tokens)
  end

  def self.total_cost_for_organization(org, start_time, end_time)
    for_organization(org).in_range(start_time, end_time).sum(:total_cost)
  end

  def self.usage_by_tool(org, start_time, end_time)
    for_organization(org)
      .in_range(start_time, end_time)
      .group(:tool_name)
      .select('tool_name, SUM(total_tokens) as total_tokens, SUM(total_cost) as total_cost, SUM(event_count) as event_count')
  end

  def self.usage_by_user(org, start_time, end_time)
    for_organization(org)
      .in_range(start_time, end_time)
      .group(:user_id)
      .select('user_id, SUM(total_tokens) as total_tokens, SUM(total_cost) as total_cost, SUM(event_count) as event_count')
  end
end
