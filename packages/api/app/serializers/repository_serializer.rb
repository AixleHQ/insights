# frozen_string_literal: true

class RepositorySerializer < BaseSerializer
  attributes :id, :external_id, :name, :full_name, :url, :default_branch, :is_private
  timestamps

  datetime_attribute :last_sync_at

  attribute :project_id do |repo|
    repo.project_id
  end

  attribute :organization_connector_id do |repo|
    repo.organization_connector_id
  end

  attribute :provider do |repo|
    repo.provider
  end

  attribute :needs_sync do |repo|
    repo.needs_sync?
  end
end
