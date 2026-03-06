require "net/http"
require "json"

namespace :rollbar do
  desc "Notify Rollbar of a deployment"
  task deploy: :environment do
    access_token = ENV["ROLLBAR_ACCESS_TOKEN"]
    unless access_token.present?
      puts "ROLLBAR_ACCESS_TOKEN not set, skipping deploy notification."
      next
    end

    uri = URI("https://api.rollbar.com/api/1/deploy/")
    data = {
      access_token: access_token,
      environment: Rails.env,
      revision: ENV.fetch("DEPLOY_REVISION", "unknown"),
      local_username: ENV.fetch("DEPLOY_USER", "deploy")
    }

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri.path, "Content-Type" => "application/json")
    request.body = data.to_json

    response = http.request(request)
    puts "Rollbar deploy response: #{response.code} #{response.body}"
    abort "Failed to notify Rollbar of deployment." unless response.is_a?(Net::HTTPSuccess)
  end
end
