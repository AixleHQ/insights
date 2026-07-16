# frozen_string_literal: true

# Resolves the original client-facing origin when behind a reverse proxy (Nginx, ALB).
# Uses X-Forwarded-Proto and X-Forwarded-Host headers when available.
module ProxyAware
  extend ActiveSupport::Concern

  private

  def external_origin
    # In staging/production, pin to APP_HOST (already required by required_env_vars.rb and
    # HTTPS-only there) instead of trusting X-Forwarded-Host/-Proto — those headers aren't
    # covered by config.hosts, so trusting them here would let a spoofed header redirect the
    # OIDC callback or Keycloak post-logout redirect to an attacker-controlled origin.
    if Rails.env.production? || Rails.env.staging?
      "https://#{ENV.fetch('APP_HOST')}"
    else
      scheme = request.headers["X-Forwarded-Proto"] || request.scheme
      host = request.headers["X-Forwarded-Host"] || request.host_with_port
      "#{scheme}://#{host}"
    end
  end
end
