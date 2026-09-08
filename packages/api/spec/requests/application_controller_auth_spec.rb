# frozen_string_literal: true

require "rails_helper"

# AIX-370 AC2 — the auth-sync failure log must identify *what* failed without
# disclosing *whose* data failed.
RSpec.describe "ApplicationController#authenticate_user! error handling", type: :request do
  let(:user) { create(:user) }

  it "logs only the error class and invalid attribute names, never the PII-bearing message" do
    invalid_user = User.new(keycloak_sub: user.keycloak_sub, email: "leaked-pii@example.com", name: "Leaked Name")
    invalid_user.valid?
    error = ActiveRecord::RecordInvalid.new(invalid_user)

    allow(UserSyncService).to receive(:sync_from_claims).and_raise(error)
    logged_messages = []
    allow(Rails.logger).to receive(:error) { |message| logged_messages << message }

    get "/api/v1/organizations", headers: { "Authorization" => "Bearer test-token-for-#{user.id}" }

    expect(response).to have_http_status(:unauthorized)
    expect(json_response[:message]).to eq("User sync failed")

    auth_log = logged_messages.find { |m| m.include?("[Auth]") }
    expect(auth_log).to include("ActiveRecord::RecordInvalid")
    expect(auth_log).to include("keycloak_sub")
    expect(auth_log).not_to include("leaked-pii@example.com")
    expect(auth_log).not_to include("Leaked Name")
  end

  # The example above stubs UserSyncService and hand-builds the exception, which pins the
  # log *format* but proves nothing about whether that branch is reachable in production.
  # This one drives the real service: the persisted record is made invalid behind
  # validations (update_column), so the next authenticated request runs
  # UserSyncService.sync_from_claims -> user.save! -> ActiveRecord::RecordInvalid for real.
  # The claims carry the user's genuine email and name, so both are available to leak.
  it "keeps the user's email and name out of the log on a real sync failure" do
    pii_user = create(:user, email: "real-path-pii@example.com", name: "Real Path Person")
    pii_user.update_column(:avatar_url, "not-a-valid-url")

    logged_messages = []
    allow(Rails.logger).to receive(:error) { |message| logged_messages << message }

    get "/api/v1/organizations", headers: { "Authorization" => "Bearer test-token-for-#{pii_user.id}" }

    expect(response).to have_http_status(:unauthorized)
    expect(json_response[:message]).to eq("User sync failed")

    auth_log = logged_messages.find { |m| m.include?("[Auth] User sync failed") }
    expect(auth_log).to be_present
    expect(auth_log).to include("ActiveRecord::RecordInvalid")
    expect(auth_log).to include("avatar_url")

    expect(auth_log).not_to include("real-path-pii@example.com")
    expect(auth_log).not_to include("Real Path Person")
    expect(response.body).not_to include("real-path-pii@example.com")

  end
end
