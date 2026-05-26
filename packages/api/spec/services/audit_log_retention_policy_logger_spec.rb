# frozen_string_literal: true

require "rails_helper"

RSpec.describe AuditLogRetentionPolicyLogger do
  let(:organization) { create(:organization) }
  let(:actor) { create(:user) }
  let(:policy) { organization.retention_policy }
  let(:request) { double("request", remote_ip: "127.0.0.1", user_agent: "RSpec") }

  describe ".log!" do
    it "logs retention.update when retention fields change" do
      expect {
        described_class.log!(
          organization: organization,
          actor: actor,
          policy: policy,
          param_keys: [ :tool_events_retention ],
          changes_before: { "tool_events_retention" => "90_days" },
          request: request
        )
      }.to change(OrganizationAuditLog, :count).by(1)

      log = OrganizationAuditLog.last
      expect(log.action).to eq("retention.update")
    end

    it "logs alert.update when alert fields change" do
      expect {
        described_class.log!(
          organization: organization,
          actor: actor,
          policy: policy,
          param_keys: [ :cost_threshold_cents, :alert_enabled ],
          changes_before: { "cost_threshold_cents" => nil, "alert_enabled" => false },
          request: request
        )
      }.to change(OrganizationAuditLog, :count).by(1)

      log = OrganizationAuditLog.last
      expect(log.action).to eq("alert.update")
    end

    it "logs both actions when mixed fields change" do
      expect {
        described_class.log!(
          organization: organization,
          actor: actor,
          policy: policy,
          param_keys: [ :tool_events_retention, :cost_threshold_cents ],
          changes_before: {
            "tool_events_retention" => "90_days",
            "cost_threshold_cents" => nil
          },
          request: request
        )
      }.to change(OrganizationAuditLog, :count).by(2)

      expect(OrganizationAuditLog.pluck(:action)).to contain_exactly("retention.update", "alert.update")
    end

    it "writes project audit logs when project is given" do
      project = create(:project, organization: organization)

      expect {
        described_class.log!(
          project: project,
          actor: actor,
          policy: project.retention_policy,
          param_keys: [ :raw_event_ttl ],
          changes_before: { "raw_event_ttl" => "24_hours" },
          request: request
        )
      }.to change(ProjectAuditLog, :count).by(1)
    end

    it "raises ArgumentError when both organization and project are nil" do
      expect {
        described_class.log!(
          organization: nil,
          project: nil,
          actor: actor,
          policy: organization.retention_policy,
          param_keys: [ :raw_event_ttl ],
          changes_before: { "raw_event_ttl" => "24_hours" },
          request: request
        )
      }.to raise_error(ArgumentError, "organization or project required")
    end
  end
end
