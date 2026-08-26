Rollbar.configure do |config|
  config.access_token = ENV["ROLLBAR_ACCESS_TOKEN"]
  config.environment = Rails.env
  config.code_version = ENV["APP_VERSION"] || `git rev-parse HEAD`.strip rescue nil
  config.enabled = !Rails.env.local?

  config.exception_level_filters.merge!(
    "ActionController::RoutingError" => "ignore"
  )

  # AIX-716. :webhook_token is the sole authenticator for the JWT-excluded
  # OpenRouter trace webhook, so Rollbar must treat it as a credential.
  #
  # Params are in fact already covered on Rack requests: Rollbar's
  # RequestDataExtractor#sensitive_params_list reads
  # env["action_dispatch.parameter_filter"], i.e. Rails' config.filter_parameters,
  # which lists :token — and Scrubbers::Params matches unanchored, so :token
  # already catches webhook_token. That path only exists when a Rack env is
  # present, so reports raised outside a request (Sidekiq, rake, a bare
  # Rollbar.error) get no parameter_filter. Naming the field here closes that gap
  # and stops the coverage depending on an unrelated list.
  config.scrub_fields |= %i[webhook_token]

  # The URL is a different problem, and scrub_fields cannot solve it at all:
  # Rollbar::Scrubbers::URL#filter rewrites only uri.user, uri.password and
  # uri.query, and its field matcher is anchored (^field$). The token is a *path*
  # segment, so a transform is the only hook that runs late enough to rewrite
  # request.url before transmission. Resolved lazily inside the proc so the
  # initializer does not pin an autoloaded constant at boot.
  config.transform << proc { |options| RollbarCredentialPathScrubber.call(options) }
end
