require "active_support/core_ext/integer/time"
require "uri"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Store uploaded files on S3 (avatars bucket). Credentials come from the ECS task IAM role.
  config.active_storage.service = :amazon

  # App sits behind a TLS-terminating ALB/CDN; trust X-Forwarded-Proto.
  config.assume_ssl = true
  config.force_ssl = true
  config.ssl_options = {
    redirect: { exclude: ->(request) { request.path == "/up" } },
    hsts: { preload: true, max_age: 63_072_000, subdomains: true }
  }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  config.cache_store = :redis_cache_store, { url: ENV["REDIS_URL"] }

  config.active_job.queue_adapter = :sidekiq

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Set host to be used by links generated in mailer templates.
  config.action_mailer.default_url_options = { host: ENV.fetch("APP_HOST", "app.db90.example.com") }

  config.action_mailer.delivery_method = :smtp
  config.action_mailer.raise_delivery_errors = true
  config.action_mailer.smtp_settings = {
    address: ENV.fetch("SMTP_ADDRESS", "smtp.sendgrid.net"),
    port: ENV.fetch("SMTP_PORT", 587).to_i,
    user_name: ENV.fetch("SMTP_USERNAME"),
    password: ENV.fetch("SMTP_PASSWORD"),
    authentication: :plain,
    enable_starttls_auto: true
  }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # APP_HOST is the public app domain (ALB host). The Temporal worker and nginx
  # reach the API directly via the internal Cloud Map host (api.<env>-db90.local),
  # bypassing the public ALB, so that host must be allowed too. Reuse RAILS_API_URL
  # (set in the shared ECS env) as the single source of truth for that hostname.
  config.hosts = [ ENV.fetch("APP_HOST") ]
  internal_api = ENV["RAILS_API_URL"]
  config.hosts << URI(internal_api).host if internal_api.present?
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  config.active_record.encryption.primary_key = ENV.fetch("ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY")
  config.active_record.encryption.deterministic_key = ENV.fetch("ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY")
  config.active_record.encryption.key_derivation_salt = ENV.fetch("ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT")
end
