class UserSyncService
  # Maps Keycloak JWT claims to User attributes
  CLAIM_MAPPING = {
    "sub" => :keycloak_sub,
    "email" => :email,
    "name" => :name,
    "picture" => :avatar_url
  }.freeze

  # Attributes the user can edit themselves — only seeded from claims on first create
  USER_EDITABLE_ATTRIBUTES = %i[name avatar_url].freeze

  # Email domains that should be auto-assigned to organizations
  DOMAIN_ORG_MAPPING = {
    "example.com" => "dualboot-partners",
    "partner.example.com" => "fueled"
  }.freeze

  class << self
    def sync_from_claims(claims)
      keycloak_sub = claims["sub"]
      raise ArgumentError, "Missing sub claim" if keycloak_sub.blank?

      email = claims["email"]

      user = find_or_initialize_user_with_email(keycloak_sub, email)
      # Domain auto-join must run only for brand-new users. sync_from_claims runs on every
      # authenticated request; re-running find_or_create would resurrect org/project
      # membership after leave/remove (AIX-611) — e.g. @example.com → dualboot-partners.
      #
      # Intentionally NOT "never had a membership in this org": after leave the user is not a
      # member, so that predicate would re-add them. Tradeoff: seeded / Administrate
      # pending-* users are not new_record? on first login, so domain auto-join never runs for
      # them — org assignment stays an admin responsibility (see user_sync_service_spec).
      is_new_user = user.new_record?
      update_user_attributes(user, claims)
      user.save!

      # AIX-370: sync_from_claims runs on EVERY authenticated request, so anything logged
      # here is written at request volume. It previously emitted the email, the Keycloak sub
      # and our user id on one line — a complete identity join key, unredactable because
      # filter_parameters only scrubs parameter hashes, never an interpolated log string.
      # Only the internal user id survives: it is a pseudonymous key, not an external
      # identity, and without it the line carries no diagnostic value at all.
      Rails.logger.info "[UserSyncService] User synced: id=#{user.id}"

      if is_new_user
        auto_assign_organization(user, claims)
        auto_assign_project(user, claims)
      end

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
          # AIX-370: logged without the email or either keycloak_sub — together those made
          # this single line a complete identity-migration record.
          Rails.logger.info "[UserSyncService] Linking existing user id=#{existing.id} to a new keycloak_sub"
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
        next unless value.present?
        # Don't overwrite user-editable fields for existing users
        next if user.persisted? && USER_EDITABLE_ATTRIBUTES.include?(attribute)

        user.send("#{attribute}=", value)
      end

      # Update last login time when:
      # 1. Never logged in before, OR
      # 2. Token was just issued (fresh login - iat within last 2 minutes), OR
      # 3. It's been more than 1 hour (throttled activity tracking)
      token_issued_at = claims["iat"] ? Time.at(claims["iat"]) : nil
      is_fresh_login = token_issued_at && token_issued_at > 2.minutes.ago

      if user.last_login_at.nil? || is_fresh_login || user.last_login_at < 1.hour.ago
        user.last_login_at = Time.current
      end

      # last_sign_in_at records discrete sign-in events (fresh JWT only).
      # last_login_at is a throttled activity tracker updated every hour.
      user.last_sign_in_at = Time.current if user.last_sign_in_at.nil? || is_fresh_login
    end

    def auto_assign_organization(user, claims)
      email = claims["email"]
      return unless email.present?

      domain = email.split("@").last&.downcase
      return unless domain.present?

      # Hardcoded legacy domain mapping
      org_slug = DOMAIN_ORG_MAPPING[domain]
      if org_slug
        organization = Organization.find_by(slug: org_slug)
        if organization
          begin
            OrganizationMembership.find_or_create_by!(user: user, organization: organization) do |m|
              m.role = "member"
            end
          rescue ActiveRecord::RecordNotUnique
            # Concurrent sync won the race; membership already exists
          end
          Rails.logger.info "[UserSyncService] Auto-assigned user id=#{user.id} to org #{org_slug} (legacy mapping)"
        end
      end

      # Dynamic domain matching via OrganizationSetting allowed_email_domain
      OrganizationSetting
        .where(key: "allowed_email_domain", value: domain)
        .includes(:organization)
        .each do |setting|
          begin
            OrganizationMembership.find_or_create_by!(user: user, organization: setting.organization) do |m|
              m.role = "member"
            end
          rescue ActiveRecord::RecordNotUnique
            # Concurrent sync won the race; membership already exists
          end
          Rails.logger.info "[UserSyncService] Auto-assigned user id=#{user.id} to org #{setting.organization.slug} (domain setting)"
        end
    end

    def auto_assign_project(user, claims)
      email = claims["email"]
      return unless email.present?

      domain = email.split("@").last&.downcase
      return unless domain.present?

      user_org_ids = user.organization_memberships.select(:organization_id)

      ActiveRecord::Base.transaction do
        ProjectSetting
          .where(key: "allowed_email_domain", value: domain)
          .joins(:project)
          .where(projects: { organization_id: user_org_ids })
          .includes(:project)
          .each do |setting|
            begin
              ProjectMembership.find_or_create_by!(user: user, project: setting.project) do |m|
                m.role = "member"
              end
            rescue ActiveRecord::RecordNotUnique
              # Concurrent sync won the race; membership already exists
            end
            Rails.logger.info "[UserSyncService] Auto-assigned user id=#{user.id} to project #{setting.project.name} (domain setting)"
          end
      end
    end
  end
end
