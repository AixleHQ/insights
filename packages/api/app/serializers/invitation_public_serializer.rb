# frozen_string_literal: true

class InvitationPublicSerializer < BaseSerializer
  # token is required so the recipient can call the accept endpoint
  # (POST /invitations/:token/accept). The caller already holds the token for
  # the public show endpoint, and the authenticated check endpoint only returns
  # invitations addressed to the current user's own email (AIX-289).
  attributes :id, :token, :role, :status

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
