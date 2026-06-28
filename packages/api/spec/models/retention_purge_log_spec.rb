# frozen_string_literal: true

require "rails_helper"

RSpec.describe RetentionPurgeLog, type: :model do
  describe "validations" do
    it "is valid with all required attributes" do
      log = build(:retention_purge_log)
      expect(log).to be_valid
    end

    it "is invalid without retention_days_applied" do
      log = build(:retention_purge_log, retention_days_applied: nil)
      expect(log).not_to be_valid
      expect(log.errors[:retention_days_applied]).to be_present
    end

    it "is invalid without cutoff_timestamp" do
      log = build(:retention_purge_log, cutoff_timestamp: nil)
      expect(log).not_to be_valid
      expect(log.errors[:cutoff_timestamp]).to be_present
    end

    it "is invalid without job_run_at" do
      log = build(:retention_purge_log, job_run_at: nil)
      expect(log).not_to be_valid
      expect(log.errors[:job_run_at]).to be_present
    end

    it "is invalid with negative records_deleted" do
      log = build(:retention_purge_log, records_deleted: -1)
      expect(log).not_to be_valid
      expect(log.errors[:records_deleted]).to be_present
    end

    it "allows project to be nil (org-level purge)" do
      log = build(:retention_purge_log, project: nil, retention_policy_type: :org)
      expect(log).to be_valid
    end
  end

  describe "associations" do
    it "belongs to organization" do
      expect(described_class.reflect_on_association(:organization).macro).to eq(:belongs_to)
    end

    it "belongs to project optionally" do
      assoc = described_class.reflect_on_association(:project)
      expect(assoc.macro).to eq(:belongs_to)
      expect(assoc.options[:optional]).to be true
    end
  end

  describe "enums" do
    it "defines retention_policy_type enum" do
      expect(described_class.retention_policy_types).to eq("org" => 0, "project" => 1)
    end

    it "defines status enum" do
      expect(described_class.statuses).to eq("success" => 0, "partial" => 1, "failed" => 2)
    end
  end

  describe "append-only guard" do
    let!(:log) { create(:retention_purge_log) }

    it "raises ActiveRecord::ReadOnlyRecord on update" do
      expect { log.update!(records_deleted: 999) }.to raise_error(ActiveRecord::ReadOnlyRecord)
    end

    it "raises ActiveRecord::ReadOnlyRecord on destroy" do
      expect { log.destroy! }.to raise_error(ActiveRecord::ReadOnlyRecord)
    end

    it "does not prevent creating new records" do
      expect { create(:retention_purge_log) }.to change(RetentionPurgeLog, :count).by(1)
    end
  end
end
