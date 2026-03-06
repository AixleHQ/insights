Rollbar.configure do |config|
  config.access_token = ENV["ROLLBAR_ACCESS_TOKEN"]
  config.environment = Rails.env
  config.code_version = ENV["APP_VERSION"] || `git rev-parse HEAD`.strip rescue nil
  config.enabled = !Rails.env.local?

  config.exception_level_filters.merge!(
    "ActionController::RoutingError" => "ignore"
  )
end
