# frozen_string_literal: true

namespace :production_readiness do
  REQUIRED_BY_ENV = {
    "production" => {
      always: %w[
        FRONTEND_URL
        APP_HOST
        MAILER_FROM
        ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY
        ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY
        ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT
        DATABASE_PASSWORD
        DATABASE_HOST
        DATABASE_NAME
        DATABASE_USERNAME
        REDIS_URL
        KEYCLOAK_URL
        KEYCLOAK_REALM
        KEYCLOAK_AUDIENCE
        KEYCLOAK_ISSUER
        KEYCLOAK_JWKS_URI
        S3_REGION
        S3_BUCKET
        RAW_EVENTS_BUCKET
        AVATARS_S3_BUCKET
        RAW_EVENT_ENCRYPTION_KEY
        TEMPORAL_HOST
        TEMPORAL_NAMESPACE
        TEMPORAL_TASK_QUEUE
        ROLLBAR_ACCESS_TOKEN
        SMTP_ADDRESS
        SMTP_PORT
        SMTP_USERNAME
        SMTP_PASSWORD
        ATLASSIAN_CLIENT_ID
        ATLASSIAN_CLIENT_SECRET
      ],
      optional: %w[
        KEYCLOAK_EXTERNAL_URL
        MAX_RETENTION_DAYS
        RAILS_LOG_LEVEL
        RAILS_MAX_THREADS
        WEB_CONCURRENCY
      ]
    },
    "staging" => {
      always: %w[
        FRONTEND_URL
        APP_HOST
        MAILER_FROM
        ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY
        ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY
        ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT
        DATABASE_PASSWORD
        DATABASE_HOST
        DATABASE_NAME
        DATABASE_USERNAME
        REDIS_URL
        KEYCLOAK_URL
        KEYCLOAK_REALM
        KEYCLOAK_AUDIENCE
        KEYCLOAK_ISSUER
        KEYCLOAK_JWKS_URI
        S3_REGION
        S3_BUCKET
        RAW_EVENTS_BUCKET
        AVATARS_S3_BUCKET
        RAW_EVENT_ENCRYPTION_KEY
        TEMPORAL_HOST
        TEMPORAL_NAMESPACE
        TEMPORAL_TASK_QUEUE
        ROLLBAR_ACCESS_TOKEN
        MAILTRAP_USERNAME
        MAILTRAP_PASSWORD
        ATLASSIAN_CLIENT_ID
        ATLASSIAN_CLIENT_SECRET
      ],
      optional: %w[
        KEYCLOAK_EXTERNAL_URL
        MAILTRAP_ADDRESS
        MAILTRAP_PORT
        MAX_RETENTION_DAYS
      ]
    }
  }.freeze

  desc "Verify required environment variables for staging/production"
  task check_env: :environment do
    env_name = Rails.env
    config = REQUIRED_BY_ENV[env_name]

    unless config
      puts "Skipping env audit: only staging/production are checked (current: #{env_name})"
      next
    end

    missing = config[:always].select { |var| ENV[var].blank? }
    empty_optional = config[:optional].select { |var| ENV[var].blank? }

    puts "=== AIX-333 Environment Audit (#{env_name}) ==="
    puts "Required (#{config[:always].size}): #{missing.empty? ? 'OK' : "#{missing.size} MISSING"}"
    missing.each { |var| puts "  MISSING: #{var}" }

    if empty_optional.any?
      puts "Optional unset (#{empty_optional.size}):"
      empty_optional.each { |var| puts "  UNSET: #{var}" }
    end

    if missing.any?
      abort "Environment audit failed: #{missing.join(', ')}"
    end

    puts "Environment audit passed."
  end

  desc "Send a test invitation email (usage: rake production_readiness:send_test_email[user@example.com])"
  task :send_test_email, [ :email ] => :environment do |_task, args|
    email = args[:email].presence || ENV.fetch("TEST_EMAIL_RECIPIENT", nil)
    abort "Provide recipient: rake production_readiness:send_test_email[user@example.com]" if email.blank?

    organization = Organization.first || Organization.create!(
      name: "Production Readiness Test Org",
      slug: "prod-readiness-test"
    )
    inviter = User.first || User.create!(
      email: "readiness-test@#{organization.id}.local",
      name: "Readiness Test",
      keycloak_sub: SecureRandom.uuid
    )

    invitation = Invitation.create!(
      organization: organization,
      invited_by: inviter,
      email: email,
      role: "member"
    )

    puts "Sending invitation email to #{email}..."
    puts "Accept URL: #{invitation.accept_url}"

    InvitationMailer.invite(invitation).deliver_now

    puts "Email delivered successfully."
  rescue StandardError => e
    abort "Email delivery failed: #{e.class}: #{e.message}"
  end

  desc "Print OAuth redirect URIs and integration client IDs to verify on prod"
  task oauth_checklist: :environment do
    frontend = ENV.fetch("FRONTEND_URL", "http://localhost:5173")
    keycloak = Keycloak.configuration.external_url

    puts "=== AIX-333 OAuth / Integration Checklist ==="
    puts "FRONTEND_URL: #{frontend}"
    puts "KEYCLOAK_EXTERNAL_URL: #{keycloak}"
    puts
    puts "Verify these redirect URIs are registered with each provider:"
    puts "  Google (Keycloak broker): #{keycloak}/realms/db90/broker/google-dbp/endpoint"
    puts "  Integration OAuth callback (GitHub/GitLab/Bitbucket/Atlassian/Linear): #{frontend}/integrations/callback"
    puts "  Keycloak login callback: #{frontend}/auth/callback"
    puts
    puts "API integration client IDs present:"
    %w[
      ATLASSIAN_CLIENT_ID
      GITHUB_CLIENT_ID
      GITLAB_CLIENT_ID
      BITBUCKET_CLIENT_ID
      LINEAR_CLIENT_ID
    ].each do |var|
      status = ENV[var].present? ? "set (#{ENV[var].to_s[0, 8]}...)" : "MISSING"
      puts "  #{var}: #{status}"
    end
    puts "  GOOGLE_CLIENT_ID: configured on Keycloak ECS task (not API)"
  end
end
