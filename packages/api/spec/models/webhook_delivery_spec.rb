# frozen_string_literal: true

require "rails_helper"

RSpec.describe WebhookDelivery, type: :model do
  describe "constants" do
    it "defines valid statuses" do
      expect(WebhookDelivery::STATUSES).to eq(%w[pending processing delivered failed])
    end

    it "defines valid providers" do
      expect(WebhookDelivery::PROVIDERS).to eq(%w[github gitlab bitbucket jira linear slack])
    end
  end

  describe "associations" do
    it { should belong_to(:organization_connector) }
    it { should have_one(:organization).through(:organization_connector) }
  end

  describe "validations" do
    subject { build(:webhook_delivery) }

    it { should validate_presence_of(:provider) }
    it { should validate_inclusion_of(:provider).in_array(WebhookDelivery::PROVIDERS) }
    it { should validate_presence_of(:event_type) }
    it { should validate_presence_of(:raw_event_key) }
    it { should validate_inclusion_of(:status).in_array(WebhookDelivery::STATUSES) }
    it { should validate_numericality_of(:attempts).is_greater_than_or_equal_to(0) }
  end

  describe "#mark_processing!" do
    it "sets status to processing, increments attempts, and sets last_attempted_at" do
      delivery = create(:webhook_delivery, status: "pending", attempts: 0)
      freeze_time do
        delivery.mark_processing!
        expect(delivery.status).to eq("processing")
        expect(delivery.attempts).to eq(1)
        expect(delivery.last_attempted_at).to be_within(1.second).of(Time.current)
      end
    end

    it "increments attempts on subsequent calls" do
      delivery = create(:webhook_delivery, :processing)
      delivery.mark_processing!
      expect(delivery.attempts).to eq(2)
    end
  end

  describe "#mark_delivered!" do
    it "sets status to delivered and records delivered_at" do
      delivery = create(:webhook_delivery, :processing)
      freeze_time do
        delivery.mark_delivered!
        expect(delivery.status).to eq("delivered")
        expect(delivery.delivered_at).to be_within(1.second).of(Time.current)
      end
    end
  end

  describe "#mark_failed!" do
    it "sets status to failed and stores the error message" do
      delivery = create(:webhook_delivery, :processing)
      delivery.mark_failed!("Upstream timeout")
      expect(delivery.status).to eq("failed")
      expect(delivery.last_error).to eq("Upstream timeout")
    end
  end

  describe "scopes" do
    let!(:pending_delivery)    { create(:webhook_delivery) }
    let!(:failed_delivery)     { create(:webhook_delivery, :failed) }
    let!(:delivered_delivery)  { create(:webhook_delivery, :delivered) }
    let!(:processing_delivery) { create(:webhook_delivery, :processing) }

    it ".failed returns only failed deliveries" do
      expect(WebhookDelivery.failed).to contain_exactly(failed_delivery)
    end

    it ".delivered returns only delivered deliveries" do
      expect(WebhookDelivery.delivered).to contain_exactly(delivered_delivery)
    end

    it ".by_status filters by status" do
      expect(WebhookDelivery.by_status("pending")).to contain_exactly(pending_delivery)
    end

    it ".by_provider filters by provider" do
      github_delivery = create(:webhook_delivery, provider: "github")
      jira_delivery   = create(:webhook_delivery, provider: "jira")
      expect(WebhookDelivery.by_provider("github")).to include(github_delivery)
      expect(WebhookDelivery.by_provider("github")).not_to include(jira_delivery)
    end
  end
end
