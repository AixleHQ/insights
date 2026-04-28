# frozen_string_literal: true

require "rails_helper"

RSpec.describe Slack::NotificationService, type: :service do
  let(:organization) { create(:organization) }
  let(:alert_data) do
    {
      alert_type: "cost_threshold",
      severity: "warning",
      title: "Daily cost exceeded",
      current_cost_usd: 150.0,
      threshold_usd: 100.0,
      percentage: 150.0
    }
  end

  describe ".deliver_alert" do
    context "when an active Slack connector exists" do
      let!(:connector) { create(:organization_connector, :slack, organization: organization) }
      let(:faraday_response) { instance_double(Faraday::Response, success?: true) }

      before do
        allow(Faraday).to receive(:post).with(connector.access_token).and_return(faraday_response)
      end

      it "posts a message to the Slack webhook URL" do
        expect(Faraday).to receive(:post).with(connector.access_token).and_return(faraday_response)

        described_class.deliver_alert(organization, alert_data)
      end

      it "does not raise an error" do
        expect { described_class.deliver_alert(organization, alert_data) }.not_to raise_error
      end

      it "includes org name, alert type, severity and timestamp in the message" do
        expect(Faraday).to receive(:post).with(connector.access_token) do |&block|
          req = double(headers: {}, body: nil)
          allow(req).to receive(:body=) do |body|
            parsed = JSON.parse(body)
            expect(parsed["text"]).to include(organization.name)
            expect(parsed["text"]).to include("cost_threshold")
            expect(parsed["text"]).to include("warning")
          end
          allow(req).to receive(:headers).and_return({})
          block.call(req)
          faraday_response
        end

        described_class.deliver_alert(organization, alert_data)
      end
    end

    context "when no active Slack connector exists" do
      it "logs a warning" do
        expect(Rails.logger).to receive(:warn).with(/No active Slack connector/)

        described_class.deliver_alert(organization, alert_data)
      end

      it "does not make any HTTP call" do
        allow(Rails.logger).to receive(:warn)
        expect(Faraday).not_to receive(:post)

        described_class.deliver_alert(organization, alert_data)
      end

      it "does not raise an error" do
        allow(Rails.logger).to receive(:warn)
        expect { described_class.deliver_alert(organization, alert_data) }.not_to raise_error
      end
    end

    context "when the Slack webhook returns a non-2xx response" do
      let!(:connector) { create(:organization_connector, :slack, organization: organization) }
      let(:faraday_response) { instance_double(Faraday::Response, success?: false, status: 403) }

      before do
        allow(Faraday).to receive(:post).and_return(faraday_response)
      end

      it "logs an error" do
        expect(Rails.logger).to receive(:error).with(/Failed to deliver/)

        described_class.deliver_alert(organization, alert_data)
      end

      it "does not raise an error" do
        allow(Rails.logger).to receive(:error)
        expect { described_class.deliver_alert(organization, alert_data) }.not_to raise_error
      end
    end

    context "when a network error occurs" do
      let!(:connector) { create(:organization_connector, :slack, organization: organization) }

      before do
        allow(Faraday).to receive(:post).and_raise(Faraday::ConnectionFailed.new("connection refused"))
      end

      it "logs an error" do
        expect(Rails.logger).to receive(:error).with(/Connection error/)

        described_class.deliver_alert(organization, alert_data)
      end

      it "does not raise an error" do
        allow(Rails.logger).to receive(:error)
        expect { described_class.deliver_alert(organization, alert_data) }.not_to raise_error
      end
    end
  end
end
