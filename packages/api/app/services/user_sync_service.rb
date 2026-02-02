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
    'example.com' => 'dualboot-partners',
    'partner.example.com' => 'fueled'
  }.freeze

  class << self
    def sync_from_claims(claims)
      keycloak_sub = claims['sub']
      raise ArgumentError, 'Missing sub claim' if keycloak_sub.blank?

      email = claims['email']
      Rails.logger.info "[UserSyncService] sync_from_claims: sub=#{keycloak_sub}, email=#{email}"

      user = find_or_initialize_user_with_email(keycloak_sub, email)
      update_user_attributes(user, claims)
      user.save!

      Rails.logger.info "[UserSyncService] User synced: id=#{user.id}, email=#{user.email}, keycloak_sub=#{user.keycloak_sub}"
      Rails.logger.info "[UserSyncService] User orgs: #{user.organization_memberships.count}, events: #{ToolEvent.where(user_id: user.id).count}"

      auto_assign_organization(user, claims) if user.organization_memberships.empty?

      user
    end

    def find_or_create_from_token(token_claims)
      sync_from_claims(token_claims)
    end

    private

    def find_or_initialize_user_with_email(keycloak_sub, email)
      # First try to find by keycloak_sub
      user = User.find_by(keycloak_sub: keycloak_sub)
      return user if user

      # Check for existing user with this email
      # This handles:
      # - Users created via seeds (keycloak_sub may be email or seed-user-*)
      # - Users created with pending- prefix
      # - Users who logged in with a different identity provider
      if email.present?
        existing = User.find_by(email: email)
        if existing
          # Update the keycloak_sub to the real OAuth value
          # This links the seeded/pending user to the actual OAuth identity
          Rails.logger.info "[UserSyncService] Linking existing user #{email} (old sub: #{existing.keycloak_sub}) to new sub: #{keycloak_sub}"
          existing.update!(keycloak_sub: keycloak_sub)
          return existing
        end
      end

      # Create new user
      User.new(keycloak_sub: keycloak_sub)
    end

    def update_user_attributes(user, claims)
      CLAIM_MAPPING.each do |claim_key, attribute|
        value = claims[claim_key]
        user.send("#{attribute}=", value) if value.present?
      end

      # Update last login time when:
      # 1. Never logged in before, OR
      # 2. Token was just issued (fresh login - iat within last 2 minutes), OR
      # 3. It's been more than 1 hour (throttled activity tracking)
      token_issued_at = claims['iat'] ? Time.at(claims['iat']) : nil
      is_fresh_login = token_issued_at && token_issued_at > 2.minutes.ago

      if user.last_login_at.nil? || is_fresh_login || user.last_login_at < 1.hour.ago
        user.last_login_at = Time.current
      end
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
