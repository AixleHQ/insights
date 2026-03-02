# frozen_string_literal: true

# Resolves the original client-facing origin when behind a reverse proxy (Nginx, ALB).
# Uses X-Forwarded-Proto and X-Forwarded-Host headers when available.
module ProxyAware
  extend ActiveSupport::Concern

  private

  def external_origin
    scheme = request.headers["X-Forwarded-Proto"] || request.scheme
    host = request.headers["X-Forwarded-Host"] || request.host_with_port
    "#{scheme}://#{host}"
  end
end
