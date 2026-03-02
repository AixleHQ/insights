# frozen_string_literal: true

# Test authentication middleware that simulates JWT authentication
# This is only loaded in the test environment

if Rails.env.test?
  class TestJwtAuthMiddleware
    EXCLUDED_PATHS = [ "/admin" ].freeze

    def initialize(app)
      @app = app
    end

    def call(env)
      # Skip for admin paths
      request_path = env["PATH_INFO"]
      if EXCLUDED_PATHS.any? { |path| request_path&.start_with?(path) }
        return @app.call(env)
      end

      auth_header = env["HTTP_AUTHORIZATION"]

      if auth_header&.start_with?("Bearer test-token-for-")
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
