# frozen_string_literal: true

class OrganizationWithMembershipSerializer < OrganizationSerializer
  attribute :user_role do |org|
    params[:user]&.role_in(org)
  end
end
