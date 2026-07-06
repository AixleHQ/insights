# frozen_string_literal: true

if Rails.env.production? || Rails.env.staging?
  required = %w[APP_HOST FRONTEND_URL]
  missing = required.reject { |var| ENV[var].present? }
  raise "Missing required environment variables: #{missing.join(', ')}" if missing.any?
end
