# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Rails parameter filtering" do
  let(:filter) { ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters) }

  it "filters keycloak_sub from request logs" do
    filtered = filter.filter("keycloak_sub" => "abc-123-real-sub", "other" => "visible")

    expect(filtered["keycloak_sub"]).to eq("[FILTERED]")
    expect(filtered["other"]).to eq("visible")
  end

  it "filters client_secret and api_token" do
    filtered = filter.filter("client_secret" => "super-secret", "api_token" => "tok_xyz", "safe" => "visible")

    expect(filtered["client_secret"]).to eq("[FILTERED]")
    expect(filtered["api_token"]).to eq("[FILTERED]")
    expect(filtered["safe"]).to eq("visible")
  end
end
