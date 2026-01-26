# frozen_string_literal: true

class OrganizationSerializer < BaseSerializer
  attributes :id, :name, :slug, :description, :is_active
  timestamps
end
