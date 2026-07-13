require_relative "boot"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Api
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # Add session/flash/method-override middleware for admin panel (Administrate requires these)
    # Rack::MethodOverride is needed so form_with's hidden _method field is respected
    # (api_only mode strips it out by default, breaking PATCH/DELETE form submissions)
    config.middleware.use Rack::MethodOverride
    config.middleware.use ActionDispatch::Cookies
    # CacheStore (not CookieStore): admin session content (e.g. the Keycloak id_token
    # needed for RP-initiated logout) must live server-side — a full JWT would blow past
    # cookie/header size limits if it round-tripped through the browser cookie itself.
    #
    # Uses its own RedisCacheStore instance (own "admin_session" namespace), not the shared
    # Rails.cache — the app cache is also used for rate limiting, JWKS caching, etc., and a
    # future Rails.cache.clear elsewhere would otherwise silently force-logout every admin.
    # Note: this still shares the underlying Redis with Rails.cache, so a `maxmemory-policy`
    # with eviction (e.g. allkeys-lru) on that instance could still drop sessions under memory
    # pressure — confirm with infra that eviction isn't enabled for this Redis.
    config.middleware.use ActionDispatch::Session::CacheStore,
      key: "_db90_admin_session",
      cache: if Rails.env.test?
        ActiveSupport::Cache::MemoryStore.new
      else
        ActiveSupport::Cache::RedisCacheStore.new(url: ENV["REDIS_URL"], namespace: "admin_session")
      end,
      expire_after: 1.day
    config.middleware.use ActionDispatch::Flash

    # Use SQL format for schema to preserve raw SQL (TimescaleDB, custom types, etc.)
    config.active_record.schema_format = :sql
  end
end
