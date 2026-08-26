# frozen_string_literal: true

# SECURITY (OWASP A05-4, AIX-371): outer Rack backstop for the four flat
# security headers (config/application.rb sets these as Action Dispatch
# defaults, but responses produced before Action Dispatch — e.g. JwtAuth's
# raw 401 triplet in app/middleware/jwt_auth.rb — bypass that default-header
# merge entirely). Fills only missing headers; never overwrites a value a
# downstream middleware/controller already set, and never touches CSP, which
# stays scoped to the Administrate admin UI via AdminContentSecurityPolicy.
class SecurityHeaders
  HEADERS = {
    "X-Content-Type-Options" => "nosniff",
    "X-Frame-Options" => "DENY",
    "Referrer-Policy" => "strict-origin-when-cross-origin",
    "Permissions-Policy" =>
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), " \
      "microphone=(), payment=(), usb=(), interest-cohort=()"
  }.freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    status, original_headers, body = @app.call(env)
    headers = original_headers.dup

    HEADERS.each do |name, value|
      next if headers.keys.any? { |existing| existing.casecmp?(name) }

      headers[name] = value
    end

    [ status, headers, body ]
  end
end
