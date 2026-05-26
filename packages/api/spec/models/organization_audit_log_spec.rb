# frozen_string_literal: true

require "rails_helper"

RSpec.describe OrganizationAuditLog, type: :model do
  describe "associations" do
    it { should belong_to(:organization) }
    it { should belong_to(:actor).class_name("User").optional }
  end

  describe "validations" do
    subject { build(:organization_audit_log) }

    it { should validate_presence_of(:action) }
    it { should validate_inclusion_of(:action).in_array(OrganizationAuditLog::ACTIONS) }
  end

  describe ".log" do
    let(:organization) { create(:organization) }
    let(:actor) { create(:user) }

    it "creates an audit log with the provided parameters" do
      resource = create(:organization_membership, organization: organization, user: actor)

      expect {
        OrganizationAuditLog.log(
          organization: organization,
          actor: actor,
          action: "member.invited",
          resource: resource,
          tracked_changes: { role: [ nil, "member" ] },
          metadata: { invited_by: actor.email }
        )
      }.to change(OrganizationAuditLog, :count).by(1)

      log = OrganizationAuditLog.last
      expect(log.organization).to eq(organization)
      expect(log.actor).to eq(actor)
      expect(log.action).to eq("member.invited")
      expect(log.resource_type).to eq("OrganizationMembership")
      expect(log.resource_id).to eq(resource.id)
      expect(log.tracked_changes).to eq("role" => [ nil, "member" ])
      expect(log.metadata).to eq("invited_by" => actor.email)
    end

    it "defaults severity to info and outcome to success" do
      OrganizationAuditLog.log(organization: organization, actor: actor, action: "settings.update")

      log = OrganizationAuditLog.last
      expect(log.severity).to eq("info")
      expect(log.outcome).to eq("success")
    end

    it "persists explicit severity and outcome when provided" do
      OrganizationAuditLog.log(
        organization: organization,
        actor: actor,
        action: "settings.update",
        severity: "warning",
        outcome: "failure"
      )

      log = OrganizationAuditLog.last
      expect(log.severity).to eq("warning")
      expect(log.outcome).to eq("failure")
    end

    it "captures request information when provided" do
      request = double("request", remote_ip: "10.0.0.1", user_agent: "Mozilla/5.0")

      OrganizationAuditLog.log(
        organization: organization,
        actor: actor,
        action: "settings.update",
        request: request
      )

      log = OrganizationAuditLog.last
      expect(log.ip_address.to_s).to eq("10.0.0.1")
      expect(log.user_agent).to eq("Mozilla/5.0")
    end

    it "handles nil request gracefully" do
      OrganizationAuditLog.log(
        organization: organization,
        actor: actor,
        action: "settings.update",
        request: nil
      )

      log = OrganizationAuditLog.last
      expect(log.ip_address).to be_nil
      expect(log.user_agent).to be_nil
    end

    it "returns nil and logs on error without raising" do
      allow(OrganizationAuditLog).to receive(:create!).and_raise(StandardError, "db error")

      result = OrganizationAuditLog.log(organization: organization, actor: actor, action: "settings.update")
      expect(result).to be_nil
    end
  end
end
