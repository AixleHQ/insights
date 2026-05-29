# frozen_string_literal: true

class ProjectSerializer < BaseSerializer
  attributes :id, :name, :slug, :description, :repository_url, :git_remote_url, :is_active
  timestamps

  attribute :organization_id do |project|
    project.organization_id
  end

  attribute :owner_id do |project|
    project.owner_id
  end

  attribute :is_personal do |project|
    project.personal?
  end

  # Lifetime attributed aggregates (see ProjectToolEventAggregates). Controller must pass
  # `params[:project_aggregate_stats]` as a Hash<String, Stat> to avoid N+1 on list routes.
  attribute :event_count do |project|
    stat = params[:project_aggregate_stats]&.[](project.id)
    stat&.event_count || 0
  end

  attribute :total_cost_usd do |project|
    stat = params[:project_aggregate_stats]&.[](project.id)
    stat&.total_cost_usd || 0.0
  end

  attribute :last_event_at do |project|
    stat = params[:project_aggregate_stats]&.[](project.id)
    stat&.last_event_at&.iso8601
  end
end
