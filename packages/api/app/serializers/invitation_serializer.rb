# frozen_string_literal: true

class InvitationSerializer < BaseSerializer
  attributes :id, :email, :role, :status, :token

  attribute :organization do |invitation|
    {
      id: invitation.organization.id,
      name: invitation.organization.name,
      slug: invitation.organization.slug
    }
  end

  attribute :invited_by do |invitation|
    {
      id: invitation.invited_by.id,
      name: invitation.invited_by.display_name,
      email: invitation.invited_by.email
    }
  end

  datetime_attribute :expires_at
  datetime_attribute :accepted_at
  timestamps
end
