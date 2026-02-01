# frozen_string_literal: true

class InvitationPublicSerializer < BaseSerializer
  attributes :id, :role, :status

  attribute :organization do |invitation|
    {
      id: invitation.organization.id,
      name: invitation.organization.name,
      slug: invitation.organization.slug
    }
  end

  attribute :invited_by_name do |invitation|
    invitation.invited_by.display_name
  end

  attribute :expired do |invitation|
    invitation.expired?
  end

  datetime_attribute :expires_at
end
