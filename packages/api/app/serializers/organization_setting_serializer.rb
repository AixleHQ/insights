# frozen_string_literal: true

class OrganizationSettingSerializer < BaseSerializer
  attributes :id, :key, :value
  timestamps

  attribute :organization_id do |setting|
    setting.organization_id
  end
end
