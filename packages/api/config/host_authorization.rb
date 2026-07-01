# frozen_string_literal: true

require "uri"

# Host allow-list for Action Dispatch::HostAuthorization in deployed environments.
# API requests reach Rails through the web/nginx proxy, so the Host header matches
# the public app hostname (e.g. staging.insights.example.com), not an internal service name.
module Aixle
  module HostAuthorization
    module_function

    def allowed_hosts
      api_host = resolved_api_host
      base_domain = resolved_base_domain(api_host)
      [ api_host, /\A.*\.#{Regexp.escape(base_domain)}\z/ ]
    end

    def resolved_api_host
      fetch_env("API_HOST") ||
        fetch_env("APP_HOST") ||
        frontend_host ||
        raise(KeyError, 'key not found: "API_HOST" (set API_HOST, APP_HOST, or FRONTEND_URL)')
    end

    def resolved_base_domain(api_host)
      fetch_env("BASE_DOMAIN") || derive_base_domain(api_host)
    end

    def fetch_env(key)
      value = ENV[key]
      value if value && !value.empty?
    end

    def derive_base_domain(api_host)
      parts = api_host.split(".")
      return api_host if parts.length <= 2

      parts[1..].join(".")
    end

    def frontend_host
      url = fetch_env("FRONTEND_URL")
      return unless url

      URI.parse(url).host
    end
  end
end
