# frozen_string_literal: true

class Issue < ApplicationRecord
  belongs_to :organization
  belongs_to :project, optional: true
  belongs_to :organization_connector
  belongs_to :assignee, class_name: "User", optional: true

  validates :external_id, uniqueness: { scope: :organization_connector_id }
  validates :key, :summary, :provider_project_key, :provider_project_id, presence: true

  scope :open,           -> { where.not(status_category: "done") }
  scope :done,           -> { where(status_category: "done") }
  scope :by_project_key, ->(k) { where(provider_project_key: k) }
end
