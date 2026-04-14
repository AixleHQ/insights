require 'rails_helper'

RSpec.describe ToolEvent, type: :model do
  describe 'constants' do
    it 'defines valid tool names' do
      expected = %w[
        claude_code cursor windsurf github_copilot
        aider continue cody tabnine amazon_q
        openrouter anthropic_api openai_api gemini_api
        custom jira
      ]
      expect(ToolEvent::TOOL_NAMES).to eq(expected)
    end

    it 'defines valid event types' do
      expected = %w[chat completion edit commit review test debug refactor documentation other issue comment sprint]
      expect(ToolEvent::EVENT_TYPES).to eq(expected)
    end
  end

  describe 'validations' do
    it 'requires tool_name' do
      event = ToolEvent.new(tool_name: nil)
      event.valid?
      expect(event.errors[:tool_name]).to be_present
    end

    it 'requires event_type' do
      event = ToolEvent.new(event_type: nil)
      event.valid?
      expect(event.errors[:event_type]).to be_present
    end

    it 'requires occurred_at' do
      event = ToolEvent.new(occurred_at: nil)
      event.valid?
      expect(event.errors[:occurred_at]).to be_present
    end

    it 'validates tokens_in is non-negative' do
      event = build(:tool_event, tokens_in: -1)
      expect(event).not_to be_valid
    end

    it 'validates tokens_out is non-negative' do
      event = build(:tool_event, tokens_out: -1)
      expect(event).not_to be_valid
    end
  end

  describe 'callbacks' do
    describe 'before_validation :calculate_tokens_total' do
      it 'calculates tokens_total from tokens_in and tokens_out' do
        event = build(:tool_event, tokens_in: 100, tokens_out: 200, tokens_total: nil)
        event.valid?
        expect(event.tokens_total).to eq(300)
      end

      it 'does not override existing tokens_total' do
        event = build(:tool_event, tokens_in: 100, tokens_out: 200, tokens_total: 500)
        event.valid?
        expect(event.tokens_total).to eq(500)
      end

      it 'handles nil values' do
        event = build(:tool_event, tokens_in: nil, tokens_out: nil, tokens_total: nil)
        event.valid?
        expect(event.tokens_total).to eq(0)
      end
    end
  end

  describe 'scopes' do
    describe '.by_tool' do
      it 'returns events for the specified tool' do
        claude = create(:tool_event, tool_name: 'claude_code')
        cursor = create(:tool_event, tool_name: 'cursor')

        expect(ToolEvent.by_tool('claude_code')).to include(claude)
        expect(ToolEvent.by_tool('claude_code')).not_to include(cursor)
      end
    end

    describe '.by_event_type' do
      it 'returns events of the specified type' do
        chat = create(:tool_event, event_type: 'chat')
        edit = create(:tool_event, :edit)

        expect(ToolEvent.by_event_type('chat')).to include(chat)
        expect(ToolEvent.by_event_type('chat')).not_to include(edit)
      end
    end

    describe '.in_range' do
      it 'returns events within the time range' do
        old = create(:tool_event, occurred_at: 1.week.ago)
        recent = create(:tool_event, occurred_at: 1.day.ago)
        future = create(:tool_event, occurred_at: 1.day.from_now)

        results = ToolEvent.in_range(2.days.ago, Time.current)

        expect(results).to include(recent)
        expect(results).not_to include(old)
        expect(results).not_to include(future)
      end
    end

    describe '.for_user' do
      it 'returns events for the specified user' do
        user = create(:user)
        other_user = create(:user)
        user_event = create(:tool_event, user: user)
        other_event = create(:tool_event, user: other_user)

        expect(ToolEvent.for_user(user)).to include(user_event)
        expect(ToolEvent.for_user(user)).not_to include(other_event)
      end
    end

    describe '.for_organization' do
      it 'returns events for the specified organization' do
        org = create(:organization)
        other_org = create(:organization)
        org_event = create(:tool_event, organization: org)
        other_event = create(:tool_event, organization: other_org)

        expect(ToolEvent.for_organization(org)).to include(org_event)
        expect(ToolEvent.for_organization(org)).not_to include(other_event)
      end
    end
  end

  describe '.total_tokens_in_range' do
    it 'returns the sum of tokens in the range' do
      create(:tool_event, occurred_at: 1.day.ago, tokens_total: 100)
      create(:tool_event, occurred_at: 1.day.ago, tokens_total: 200)
      create(:tool_event, occurred_at: 1.week.ago, tokens_total: 1000)

      total = ToolEvent.total_tokens_in_range(2.days.ago, Time.current)
      expect(total).to eq(300)
    end
  end

  describe '.total_cost_in_range' do
    it 'returns the sum of cost in the range' do
      create(:tool_event, occurred_at: 1.day.ago, cost_usd: 0.01)
      create(:tool_event, occurred_at: 1.day.ago, cost_usd: 0.02)
      create(:tool_event, occurred_at: 1.week.ago, cost_usd: 1.00)

      total = ToolEvent.total_cost_in_range(2.days.ago, Time.current)
      expect(total).to eq(0.03)
    end
  end
end
