# frozen_string_literal: true

# Users with at least one active UserToolAccount on their org membership.
class MemberCliConnectionQuery
  def self.connected_user_ids(organization_id:, user_ids:)
    return Set.new if organization_id.blank? || user_ids.blank?

    Set.new(
      UserToolAccount.active
        .joins(:organization_membership)
        .where(organization_memberships: { organization_id: organization_id, user_id: user_ids })
        .distinct
        .pluck("organization_memberships.user_id")
    )
  end
end
