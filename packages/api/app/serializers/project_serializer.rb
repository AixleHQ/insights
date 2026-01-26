# frozen_string_literal: true

class ProjectSerializer < BaseSerializer
  attributes :id, :name, :slug, :description, :is_active
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
end
