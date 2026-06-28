# frozen_string_literal: true

require "rails_helper"

RSpec.describe ProjectAuditLog, type: :model do
  describe "associations" do
    it { should belong_to(:project) }
    it { should belong_to(:actor).class_name("User").optional }
  end

  describe "validations" do
    subject { build(:project_audit_log) }

    it { should validate_presence_of(:action) }
    it { should validate_inclusion_of(:action).in_array(ProjectAuditLog::ACTIONS) }
  end

  describe ".log" do
    let(:organization) { create(:organization) }
    let(:project) { create(:project, organization: organization) }
    let(:actor) { create(:user) }

    it "creates an audit log with the provided parameters" do
      expect {
        ProjectAuditLog.log(
          project: project,
          actor: actor,
          action: "settings.update",
          tracked_changes: { name: [ "Old", "New" ] },
          metadata: { reason: "Test" }
        )
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.project).to eq(project)
      expect(log.actor).to eq(actor)
      expect(log.action).to eq("settings.update")
      expect(log.tracked_changes).to eq("name" => [ "Old", "New" ])
      expect(log.metadata).to eq("reason" => "Test")
    end

    it "defaults severity to info and outcome to success" do
      ProjectAuditLog.log(project: project, actor: actor, action: "settings.update")

      log = ProjectAuditLog.last
      expect(log.severity).to eq("info")
      expect(log.outcome).to eq("success")
    end

    it "persists explicit severity and outcome when provided" do
      ProjectAuditLog.log(
        project: project,
        actor: actor,
        action: "settings.update",
        severity: "warning",
        outcome: "failure"
      )

      log = ProjectAuditLog.last
      expect(log.severity).to eq("warning")
      expect(log.outcome).to eq("failure")
    end

    it "captures request information when provided" do
      request = double("request", remote_ip: "10.0.0.1", user_agent: "Mozilla/5.0")

      ProjectAuditLog.log(
        project: project,
        actor: actor,
        action: "settings.update",
        request: request
      )

      log = ProjectAuditLog.last
      expect(log.ip_address.to_s).to eq("10.0.0.1")
      expect(log.user_agent).to eq("Mozilla/5.0")
    end

    it "handles nil request gracefully" do
      ProjectAuditLog.log(
        project: project,
        actor: actor,
        action: "settings.update",
        request: nil
      )

      log = ProjectAuditLog.last
      expect(log.ip_address).to be_nil
      expect(log.user_agent).to be_nil
    end

    it "returns nil and logs on error without raising" do
      allow(ProjectAuditLog).to receive(:create!).and_raise(StandardError, "db error")

      result = ProjectAuditLog.log(project: project, actor: actor, action: "settings.update")
      expect(result).to be_nil
    end
  end
end
