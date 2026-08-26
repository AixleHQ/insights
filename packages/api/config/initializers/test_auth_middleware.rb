# frozen_string_literal: true

# Test authentication middleware that simulates JWT authentication.
#
# Defense in depth: gated on BOTH Rails.env.test? AND an explicit ALLOW_TEST_AUTH_MIDDLEWARE
# flag that is set only by spec/rails_helper.rb (never by any infra config — Dockerfile,
# docker-compose.yml, ECS task def, CI YAML). Rails.env.test? alone can't be the only gate:
# a deploy accidentally booted with RAILS_ENV=test would satisfy it, which is exactly the
# threat this guards against. The second flag can only ever be set by this test suite's own
# Ruby bootstrap code, not by any environment misconfiguration.

if Rails.env.test?
  class TestJwtAuthMiddleware
    EXCLUDED_PATHS = [ "/admin" ].freeze

    def self.enabled?
      Rails.env.test? && ENV["ALLOW_TEST_AUTH_MIDDLEWARE"] == "1"
    end

    def initialize(app)
      @app = app
    end

    def call(env)
      return @app.call(env) unless self.class.enabled?

      # Skip for admin paths
      request_path = env["PATH_INFO"]
      if EXCLUDED_PATHS.any? { |path| request_path&.start_with?(path) }
        return @app.call(env)
      end

      auth_header = env["HTTP_AUTHORIZATION"]

      if auth_header&.start_with?("Bearer test-impersonation-nojti-")
        # Special token for testing missing-jti guard: test-impersonation-nojti-<user_id>-by-<impersonator_id>
        nojti_match = auth_header.match(/Bearer test-impersonation-nojti-(.+)-by-([a-f0-9-]+)\z/)
        if nojti_match
          user = User.find_by(id: nojti_match[1])
          impersonator = User.find_by(id: nojti_match[2])
          if user && impersonator
            env["jwt.claims"] = {
              "sub" => user.keycloak_sub,
              "email" => user.email,
              "name" => user.name,
              "iat" => Time.current.to_i,
              "exp" => 1.hour.from_now.to_i
              # jti intentionally absent
            }
            env["jwt.impersonation"] = true
            env["jwt.impersonator_id"] = impersonator.id
            env["jwt.impersonator_email"] = impersonator.email
          end
        end
      elsif auth_header&.start_with?("Bearer test-impersonation-")
        # Formats:
        #   test-impersonation-<user_id>-by-<impersonator_id>
        #   test-impersonation-<user_id>-by-<impersonator_id>-jti-<jti>
        match = auth_header.match(/Bearer test-impersonation-(.+)-by-([a-f0-9-]+?)(?:-jti-([a-f0-9-]+))?\z/)
        if match
          user = User.find_by(id: match[1])
          impersonator = User.find_by(id: match[2])

          if user && impersonator
            exp = 1.hour.from_now.to_i
            jti = match[3] || SecureRandom.uuid
            env["jwt.claims"] = {
              "sub" => user.keycloak_sub,
              "email" => user.email,
              "name" => user.name,
              "iat" => Time.current.to_i,
              "exp" => exp,
              "jti" => jti
            }
            env["jwt.impersonation"] = true
            env["jwt.impersonator_id"] = impersonator.id
            env["jwt.impersonator_email"] = impersonator.email
          end
        end
      elsif auth_header&.start_with?("Bearer test-token-for-")
        user_id = auth_header.sub("Bearer test-token-for-", "")
        user = User.find_by(id: user_id)

        if user
          env["jwt.claims"] = {
            "sub" => user.keycloak_sub,
            "email" => user.email,
            "name" => user.name,
            "preferred_username" => user.email.split("@").first,
            "iat" => Time.current.to_i,
            "exp" => 1.hour.from_now.to_i
          }
        end
      end

      @app.call(env)
    end
  end

  Rails.application.config.middleware.insert_before(0, TestJwtAuthMiddleware)
end
