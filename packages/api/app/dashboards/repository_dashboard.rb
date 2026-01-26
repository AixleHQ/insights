# frozen_string_literal: true

require 'administrate/base_dashboard'

class RepositoryDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    project: Field::BelongsTo,
    organization_connector: Field::BelongsTo,
    external_id: Field::String,
    name: Field::String,
    full_name: Field::String,
    description: Field::Text,
    default_branch: Field::String,
    clone_url: Field::String,
    html_url: Field::String,
    is_private: Field::Boolean,
    last_sync_at: Field::DateTime,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    name
    full_name
    project
    is_private
    last_sync_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    project
    organization_connector
    external_id
    name
    full_name
    description
    default_branch
    clone_url
    html_url
    is_private
    last_sync_at
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    project
    organization_connector
    external_id
    name
    full_name
    description
    default_branch
    clone_url
    html_url
    is_private
  ].freeze

  COLLECTION_FILTERS = {
    private: ->(resources) { resources.where(is_private: true) },
    public: ->(resources) { resources.where(is_private: false) }
  }.freeze

  def display_resource(repository)
    repository.full_name
  end
end
