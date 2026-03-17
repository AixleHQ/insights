require 'rails_helper'

RSpec.describe ProjectConnector, type: :model do
  describe 'constants' do
    it 'defines only AI provider connector types' do
      expect(ProjectConnector::CONNECTOR_TYPES).to eq(%w[openrouter anthropic openai gemini])
    end

    it 'defines valid statuses' do
      expect(ProjectConnector::STATUSES).to eq(%w[connected error disconnected])
    end
  end

  describe 'associations' do
    it { should belong_to(:project) }
  end

  describe 'validations' do
    subject { build(:project_connector) }

    it { should validate_presence_of(:connector_type) }

    it 'validates uniqueness of connector type per project' do
      connector = create(:project_connector, connector_type: 'anthropic')
      duplicate = build(:project_connector, project: connector.project, connector_type: 'anthropic')
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:connector_type]).to include('already exists for this project')
    end

    it 'allows the same connector type for different projects' do
      create(:project_connector, connector_type: 'anthropic')
      other = build(:project_connector, connector_type: 'anthropic')
      expect(other).to be_valid
    end

    it 'rejects non-AI connector types' do
      connector = build(:project_connector, connector_type: 'github')
      expect(connector).not_to be_valid
    end

    it { should allow_value(true).for(:is_active) }
    it { should allow_value(false).for(:is_active) }
  end

  describe 'encryption' do
    it 'encrypts access_token' do
      connector = create(:project_connector, access_token: 'secret_api_key')
      expect(connector.access_token).to eq('secret_api_key')
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only non-disconnected connectors' do
        active = create(:project_connector, is_active: true, status: 'connected')
        inactive = create(:project_connector, is_active: false, status: 'disconnected')

        expect(ProjectConnector.active).to include(active)
        expect(ProjectConnector.active).not_to include(inactive)
      end
    end

    describe '.by_type' do
      it 'returns connectors of the specified type' do
        anthropic = create(:project_connector, connector_type: 'anthropic')
        openai = create(:project_connector, connector_type: 'openai')

        expect(ProjectConnector.by_type('anthropic')).to include(anthropic)
        expect(ProjectConnector.by_type('anthropic')).not_to include(openai)
      end
    end
  end

  describe '#token_expired?' do
    it 'returns false when token_expires_at is nil' do
      connector = build(:project_connector, token_expires_at: nil)
      expect(connector.token_expired?).to be false
    end

    it 'returns true when token is expired' do
      connector = build(:project_connector, token_expires_at: 1.hour.ago)
      expect(connector.token_expired?).to be true
    end

    it 'returns false when token is not expired' do
      connector = build(:project_connector, token_expires_at: 1.hour.from_now)
      expect(connector.token_expired?).to be false
    end
  end

  describe '#ai_provider?' do
    %w[anthropic openai openrouter gemini].each do |provider|
      it "returns true for #{provider}" do
        expect(build(:project_connector, connector_type: provider).ai_provider?).to be true
      end
    end
  end

  describe '#mark_connected!' do
    it 'sets status to connected, clears last_error, and updates last_sync_at' do
      connector = create(:project_connector, :with_error)

      freeze_time do
        connector.mark_connected!
        expect(connector.status).to eq('connected')
        expect(connector.last_error).to be_nil
        expect(connector.last_sync_at).to eq(Time.current)
        expect(connector.is_active).to be true
      end
    end
  end

  describe '#mark_synced!' do
    it 'updates last_sync_at and clears last_error' do
      connector = create(:project_connector, last_error: 'previous error')

      freeze_time do
        connector.mark_synced!
        expect(connector.last_sync_at).to eq(Time.current)
        expect(connector.last_error).to be_nil
        expect(connector.status).to eq('connected')
      end
    end
  end

  describe '#mark_error!' do
    it 'sets status to error and stores the error message' do
      connector = create(:project_connector)
      connector.mark_error!('API key revoked')
      expect(connector.status).to eq('error')
      expect(connector.last_error).to eq('API key revoked')
    end
  end

  describe '#mark_disconnected!' do
    it 'sets status to disconnected and deactivates' do
      connector = create(:project_connector)
      connector.mark_disconnected!
      expect(connector.status).to eq('disconnected')
      expect(connector.is_active).to be false
    end
  end
end
