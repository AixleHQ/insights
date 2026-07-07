require 'rails_helper'

RSpec.describe AuditLog, type: :model do
  describe 'constants' do
    it 'defines valid risk levels' do
      expect(AuditLog::RISK_LEVELS).to eq(%w[none low medium high critical])
    end
  end

  describe 'associations' do
    it { should belong_to(:organization) }
    it { should belong_to(:policy_version).class_name('SanitizationPolicy').optional }
    it { should belong_to(:tool_event).class_name('ToolEvent').optional }
  end

  describe 'validations' do
    subject { build(:audit_log) }

    it { should validate_presence_of(:raw_event_key) }
    it { should validate_presence_of(:risk_level) }
    it { should validate_inclusion_of(:risk_level).in_array(AuditLog::RISK_LEVELS) }
    it { should validate_numericality_of(:confidence_score).is_greater_than_or_equal_to(0).is_less_than_or_equal_to(1).allow_nil }
  end

  describe 'scopes' do
    describe '.by_risk_level' do
      it 'returns logs with the specified risk level' do
        low = create(:audit_log, risk_level: 'low')
        high = create(:audit_log, :high_risk)

        expect(AuditLog.by_risk_level('low')).to include(low)
        expect(AuditLog.by_risk_level('low')).not_to include(high)
      end
    end

    describe '.high_risk' do
      it 'returns only high and critical risk logs' do
        low = create(:audit_log, risk_level: 'low')
        medium = create(:audit_log, risk_level: 'medium')
        high = create(:audit_log, risk_level: 'high')
        critical = create(:audit_log, risk_level: 'critical')
        none = create(:audit_log, :none_risk)

        results = AuditLog.high_risk
        expect(results).not_to include(low)
        expect(results).not_to include(medium)
        expect(results).to include(high)
        expect(results).to include(critical)
        expect(results).not_to include(none)
      end
    end

    describe '.with_workflow' do
      it 'returns logs with the specified workflow' do
        workflow_id = SecureRandom.uuid
        with_workflow = create(:audit_log, :with_workflow, temporal_workflow_id: workflow_id)
        without_workflow = create(:audit_log)

        expect(AuditLog.with_workflow(workflow_id)).to include(with_workflow)
        expect(AuditLog.with_workflow(workflow_id)).not_to include(without_workflow)
      end
    end
  end

  describe '#high_risk?' do
    it 'returns true for high risk level' do
      log = build(:audit_log, risk_level: 'high')
      expect(log.high_risk?).to be true
    end

    it 'returns true for critical risk level' do
      log = build(:audit_log, risk_level: 'critical')
      expect(log.high_risk?).to be true
    end

    it 'returns false for low risk level' do
      log = build(:audit_log, risk_level: 'low')
      expect(log.high_risk?).to be false
    end

    it 'returns false for medium risk level' do
      log = build(:audit_log, risk_level: 'medium')
      expect(log.high_risk?).to be false
    end

    it 'returns false for none risk level' do
      log = build(:audit_log, risk_level: 'none')
      expect(log.high_risk?).to be false
    end
  end

  describe '#linked_to_event?' do
    it 'returns true when tool_event_id is present' do
      log = build(:audit_log, tool_event_id: SecureRandom.uuid)
      expect(log.linked_to_event?).to be true
    end

    it 'returns false when tool_event_id is nil' do
      log = build(:audit_log, tool_event_id: nil)
      expect(log.linked_to_event?).to be false
    end
  end

  describe '#user_display' do
    it 'returns the acting user display name via the tool event' do
      tool_event = create(:tool_event)
      log = create(:audit_log, tool_event: tool_event)
      expect(log.user_display).to eq(tool_event.user.display_name)
    end

    it 'returns nil when there is no tool event' do
      log = build(:audit_log, tool_event: nil)
      expect(log.user_display).to be_nil
    end
  end
end
