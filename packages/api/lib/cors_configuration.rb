# frozen_string_literal: true

class CorsConfiguration
  DEVELOPMENT_ORIGINS = [
    "http://localhost:5173", "http://localhost:3000",
    "http://127.0.0.1:5173", "http://127.0.0.1:3000"
  ].freeze

  def self.allowed_origins
    if Rails.env.production? || Rails.env.staging?
      [ ENV.fetch("FRONTEND_URL") ]
    else
      DEVELOPMENT_ORIGINS
    end
  end
end
