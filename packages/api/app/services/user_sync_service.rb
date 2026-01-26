class UserSyncService
  # Maps Keycloak JWT claims to User attributes
  CLAIM_MAPPING = {
    'sub' => :keycloak_sub,
    'email' => :email,
    'name' => :name,
    'picture' => :avatar_url
  }.freeze

  # Email domains that should be auto-assigned to organizations
  DOMAIN_ORG_MAPPING = {
    'example.com' => 'dbp',
    'partner.example.com' => 'fueled'
  }.freeze

  class << self
    def sync_from_claims(claims)
      keycloak_sub = claims['sub']
      raise ArgumentError, 'Missing sub claim' if keycloak_sub.blank?

      user = find_or_initialize_user(keycloak_sub)
      update_user_attributes(user, claims)
      user.save!

      auto_assign_organization(user, claims) if user.organization_memberships.empty?

      user
    end

    def find_or_create_from_token(token_claims)
      sync_from_claims(token_claims)
    end

    private

    def find_or_initialize_user(keycloak_sub)
      User.find_or_initialize_by(keycloak_sub: keycloak_sub)
    end

    def update_user_attributes(user, claims)
      CLAIM_MAPPING.each do |claim_key, attribute|
        value = claims[claim_key]
        user.send("#{attribute}=", value) if value.present?
      end

      # Update last sign in time
      user.last_sign_in_at = Time.current
    end

    def auto_assign_organization(user, claims)
      email = claims['email']
      return unless email.present?

      domain = email.split('@').last&.downcase
      org_slug = DOMAIN_ORG_MAPPING[domain]
      return unless org_slug

      organization = Organization.find_by(slug: org_slug)
      return unless organization

      # Create membership with default role
      OrganizationMembership.find_or_create_by!(
        user: user,
        organization: organization
      ) do |membership|
        membership.role = 'member'
      end

      Rails.logger.info "[UserSyncService] Auto-assigned user #{user.email} to org #{org_slug}"
    end
  end
end
