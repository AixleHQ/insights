# frozen_string_literal: true

# JWT authentication helpers for specs
# The actual test middleware is in config/initializers/test_auth_middleware.rb.
# It is gated on Rails.env.test? AND ENV["ALLOW_TEST_AUTH_MIDDLEWARE"] (set by rails_helper.rb).
# This file provides helper methods for generating test tokens

module JwtAuthStub
  def self.claims_for(user)
    {
      'sub' => user.keycloak_sub,
      'email' => user.email,
      'name' => user.name,
      'preferred_username' => user.email.split('@').first,
      'iat' => Time.current.to_i,
      'exp' => 1.hour.from_now.to_i
    }
  end
end
