# frozen_string_literal: true

# SECURITY (OWASP A05-4, AIX-371): insert by middleware class, not position
# zero. Rack::Cors is already registered at position 0 (config/initializers/cors.rb);
# inserting SecurityHeaders relative to that class keeps ordering independent of
# initializer load order and makes it the outermost middleware, wrapping every
# downstream response — including JwtAuth's raw 401 and CORS-generated responses.
#
# Explicitly require SecurityHeaders before Rails autoloading, matching the
# JwtAuth precedent in config/initializers/keycloak.rb: passing the class
# itself (not a string) to `insert_before` resolves the constant immediately,
# before Zeitwerk's autoloader is reliably available at initializer time.
require_relative "../../app/middleware/security_headers"

Rails.application.config.middleware.insert_before Rack::Cors, SecurityHeaders
