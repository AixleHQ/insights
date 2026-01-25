require 'rails_helper'

RSpec.describe UserToolAccount, type: :model do
  describe 'constants' do
    it 'defines valid tool names' do
      expected = %w[
        claude_code cursor windsurf github_copilot
        aider continue cody tabnine amazon_q
        openrouter anthropic_api openai_api gemini_api
        custom
      ]
      expect(UserToolAccount::TOOL_NAMES).to eq(expected)
    end
  end

  describe 'associations' do
    it { should belong_to(:organization_membership) }
    it { should have_one(:user).through(:organization_membership) }
    it { should have_one(:organization).through(:organization_membership) }
  end

  describe 'validations' do
    subject { build(:user_tool_account) }

    it { should validate_presence_of(:tool_name) }

    # Note: validate_inclusion_of doesn't work with PostgreSQL ENUMs
    # The database enforces the enum values directly

    it 'validates uniqueness of tool_name per membership' do
      account = create(:user_tool_account, tool_name: 'claude_code')
      duplicate = build(:user_tool_account, organization_membership: account.organization_membership, tool_name: 'claude_code')
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:tool_name]).to include('account already exists for this membership')
    end

    it { should allow_value(true).for(:is_active) }
    it { should allow_value(false).for(:is_active) }
  end

  describe 'encryption' do
    it 'encrypts access_token' do
      account = create(:user_tool_account, access_token: 'secret_token')
      expect(account.access_token).to eq('secret_token')
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only active accounts' do
        active = create(:user_tool_account, is_active: true)
        inactive = create(:user_tool_account, is_active: false)

        expect(UserToolAccount.active).to include(active)
        expect(UserToolAccount.active).not_to include(inactive)
      end
    end

    describe '.by_tool' do
      it 'returns accounts for the specified tool' do
        claude = create(:user_tool_account, tool_name: 'claude_code')
        cursor = create(:user_tool_account, tool_name: 'cursor')

        expect(UserToolAccount.by_tool('claude_code')).to include(claude)
        expect(UserToolAccount.by_tool('claude_code')).not_to include(cursor)
      end
    end
  end

  describe '#token_expired?' do
    it 'returns false when token_expires_at is nil' do
      account = build(:user_tool_account, token_expires_at: nil)
      expect(account.token_expired?).to be false
    end

    it 'returns true when token is expired' do
      account = build(:user_tool_account, token_expires_at: 1.hour.ago)
      expect(account.token_expired?).to be true
    end

    it 'returns false when token is not expired' do
      account = build(:user_tool_account, token_expires_at: 1.hour.from_now)
      expect(account.token_expired?).to be false
    end
  end
end
