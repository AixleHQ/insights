# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin Retention", type: :request do
  let(:global_admin) { create(:user, :global_admin) }
  let(:regular_user) { create(:user) }

  describe "POST /admin/retention/purge" do
    context "when authenticated as a global admin" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(global_admin)
      end

      it "enqueues DataRetentionPurgeJob and returns 200" do
        expect(DataRetentionPurgeJob).to receive(:perform_async)

        post admin_purge_retention_path, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body["enqueued"]).to be true
      end
    end

    context "when authenticated as a non-admin user" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(regular_user)
      end

      it "returns 403 Forbidden" do
        post admin_purge_retention_path, as: :json

        expect(response).to have_http_status(:forbidden)
        expect(response.parsed_body["error"]).to eq("Forbidden")
      end
    end

    context "when unauthenticated" do
      before do
        allow_any_instance_of(Admin::ApplicationController)
          .to receive(:current_admin_user)
          .and_return(nil)
      end

      it "returns 403 Forbidden" do
        post admin_purge_retention_path, as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end
  end
end
