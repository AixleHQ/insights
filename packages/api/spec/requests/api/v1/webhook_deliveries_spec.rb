# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::WebhookDeliveries", type: :request do
  let(:organization) { create(:organization) }
  let(:admin)        { create(:user) }
  let(:member)       { create(:user) }
  let(:connector)    { create(:organization_connector, organization: organization) }

  before do
    create(:organization_membership, user: admin,  organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: "member")
  end

  describe "GET /api/v1/organizations/:organization_id/webhook_deliveries" do
    let!(:delivery_github_failed)    { create(:webhook_delivery, :failed,    organization_connector: connector, provider: "github") }
    let!(:delivery_jira_delivered)   { create(:webhook_delivery, :delivered, organization_connector: connector, provider: "jira") }
    let!(:delivery_gitlab_pending)   { create(:webhook_delivery,             organization_connector: connector, provider: "gitlab") }
    let!(:delivery_other_org) do
      other_connector = create(:organization_connector)
      create(:webhook_delivery, organization_connector: other_connector)
    end

    it "returns paginated deliveries for the organization" do
      authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                        user: admin, organization: organization

      expect_success
      expect(json_data.length).to eq(3)
      ids = json_data.map { |d| d[:id] }
      expect(ids).not_to include(delivery_other_org.id)
    end

    it "returns 403 for non-admin member" do
      authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                        user: member, organization: organization

      expect_forbidden
    end

    context "filtering by status" do
      it "returns only failed deliveries" do
        authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                          user: admin, organization: organization, params: { status: "failed" }

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:id]).to eq(delivery_github_failed.id)
      end
    end

    context "filtering by provider" do
      it "returns only jira deliveries" do
        authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                          user: admin, organization: organization, params: { provider: "jira" }

        expect_success
        expect(json_data.length).to eq(1)
        expect(json_data.first[:id]).to eq(delivery_jira_delivered.id)
      end
    end

    context "filtering by date_from" do
      it "returns deliveries created on or after the given date" do
        old_delivery = create(:webhook_delivery, organization_connector: connector,
                              created_at: 10.days.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                          user: admin, organization: organization,
                          params: { date_from: 5.days.ago.iso8601 }

        expect_success
        ids = json_data.map { |d| d[:id] }
        expect(ids).not_to include(old_delivery.id)
      end
    end

    context "filtering by date_to" do
      it "returns deliveries created on or before end of the given day" do
        future_delivery = create(:webhook_delivery, organization_connector: connector,
                                 created_at: 5.days.from_now)

        authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                          user: admin, organization: organization,
                          params: { date_to: 1.day.from_now.iso8601 }

        expect_success
        ids = json_data.map { |d| d[:id] }
        expect(ids).not_to include(future_delivery.id)
      end
    end

    context "with invalid date format" do
      it "returns 400 bad request" do
        authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                          user: admin, organization: organization,
                          params: { date_from: "not-a-date" }

        expect(response).to have_http_status(:bad_request)
      end
    end

    it "returns camelCase fields" do
      authenticated_get "/api/v1/organizations/#{organization.id}/webhook_deliveries",
                        user: admin, organization: organization

      expect_success
      record = json_data.find { |d| d[:id] == delivery_github_failed.id }
      expect(record).to include(:organizationConnectorId, :eventType, :rawEventKey,
                                :lastAttemptedAt, :lastError, :deliveredAt,
                                :createdAt, :updatedAt)
    end
  end

  describe "POST /api/v1/organizations/:organization_id/webhook_deliveries/:id/retry" do
    let(:delivery) { create(:webhook_delivery, :failed, organization_connector: connector) }

    before do
      allow(RawEventStore).to receive(:exists?).and_return(true)
      allow(RawEventStore).to receive(:fetch).and_return({ "action" => "push" })
      allow(GithubSyncJob).to receive(:perform_later)
    end

    it "re-enqueues the delivery and returns 202" do
      authenticated_post(
        "/api/v1/organizations/#{organization.id}/webhook_deliveries/#{delivery.id}/retry",
        user: admin, organization: organization
      )

      expect(response).to have_http_status(:accepted)
      expect(delivery.reload.status).to eq("pending")
    end

    it "dispatches the sync job" do
      expect(GithubSyncJob).to receive(:perform_later).with(
        connector.id, "webhook", hash_including(delivery_id: delivery.id)
      )

      authenticated_post(
        "/api/v1/organizations/#{organization.id}/webhook_deliveries/#{delivery.id}/retry",
        user: admin, organization: organization
      )
    end

    it "returns 403 for non-admin member" do
      authenticated_post(
        "/api/v1/organizations/#{organization.id}/webhook_deliveries/#{delivery.id}/retry",
        user: member, organization: organization
      )

      expect_forbidden
    end

    context "when the delivery is not failed" do
      let(:delivery) { create(:webhook_delivery, :delivered, organization_connector: connector) }

      it "returns 422" do
        authenticated_post(
          "/api/v1/organizations/#{organization.id}/webhook_deliveries/#{delivery.id}/retry",
          user: admin, organization: organization
        )

        expect(response).to have_http_status(:unprocessable_content)
      end
    end

    context "when the raw payload has expired" do
      before { allow(RawEventStore).to receive(:fetch).and_return(nil) }

      it "returns 422 with an expiry message" do
        authenticated_post(
          "/api/v1/organizations/#{organization.id}/webhook_deliveries/#{delivery.id}/retry",
          user: admin, organization: organization
        )

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("expired")
      end
    end

    context "concurrent retry — two simultaneous requests" do
      it "allows only one to succeed" do
        # Simulate a second concurrent request that beats us to the update
        # by first changing status to pending
        delivery.update!(status: "pending")

        authenticated_post(
          "/api/v1/organizations/#{organization.id}/webhook_deliveries/#{delivery.id}/retry",
          user: admin, organization: organization
        )

        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end
end
