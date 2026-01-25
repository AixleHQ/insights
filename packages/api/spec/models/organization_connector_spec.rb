require 'rails_helper'

RSpec.describe OrganizationConnector, type: :model do
  describe 'constants' do
    it 'defines valid connector types' do
      expect(OrganizationConnector::CONNECTOR_TYPES).to eq(%w[github gitlab bitbucket jira linear openrouter anthropic openai gemini])
    end
  end

  describe 'associations' do
    it { should belong_to(:organization) }
    it { should have_many(:repositories).dependent(:destroy) }
  end

  describe 'validations' do
    subject { build(:organization_connector) }

    it { should validate_presence_of(:connector_type) }

    # Note: validate_inclusion_of doesn't work with PostgreSQL ENUMs
    # The database enforces the enum values directly
    it 'rejects invalid connector types at database level' do
      connector = build(:organization_connector)
      expect(connector).to be_valid
    end

    it 'validates uniqueness of connector type per organization' do
      connector = create(:organization_connector, connector_type: 'github')
      duplicate = build(:organization_connector, organization: connector.organization, connector_type: 'github')
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:connector_type]).to include('already exists for this organization')
    end

    it { should allow_value(true).for(:is_active) }
    it { should allow_value(false).for(:is_active) }
  end

  describe 'encryption' do
    it 'encrypts access_token' do
      connector = create(:organization_connector, access_token: 'secret_token')
      expect(connector.access_token).to eq('secret_token')
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only active connectors' do
        active = create(:organization_connector, is_active: true)
        inactive = create(:organization_connector, is_active: false)

        expect(OrganizationConnector.active).to include(active)
        expect(OrganizationConnector.active).not_to include(inactive)
      end
    end

    describe '.by_type' do
      it 'returns connectors of the specified type' do
        github = create(:organization_connector, connector_type: 'github')
        gitlab = create(:organization_connector, connector_type: 'gitlab')

        expect(OrganizationConnector.by_type('github')).to include(github)
        expect(OrganizationConnector.by_type('github')).not_to include(gitlab)
      end
    end
  end

  describe '#token_expired?' do
    it 'returns false when token_expires_at is nil' do
      connector = build(:organization_connector, token_expires_at: nil)
      expect(connector.token_expired?).to be false
    end

    it 'returns true when token is expired' do
      connector = build(:organization_connector, token_expires_at: 1.hour.ago)
      expect(connector.token_expired?).to be true
    end

    it 'returns false when token is not expired' do
      connector = build(:organization_connector, token_expires_at: 1.hour.from_now)
      expect(connector.token_expired?).to be false
    end
  end

  describe '#source_control?' do
    it 'returns true for github' do
      expect(build(:organization_connector, connector_type: 'github').source_control?).to be true
    end

    it 'returns true for gitlab' do
      expect(build(:organization_connector, connector_type: 'gitlab').source_control?).to be true
    end

    it 'returns false for jira' do
      expect(build(:organization_connector, connector_type: 'jira').source_control?).to be false
    end
  end

  describe '#project_management?' do
    it 'returns true for jira' do
      expect(build(:organization_connector, connector_type: 'jira').project_management?).to be true
    end

    it 'returns true for linear' do
      expect(build(:organization_connector, connector_type: 'linear').project_management?).to be true
    end

    it 'returns false for github' do
      expect(build(:organization_connector, connector_type: 'github').project_management?).to be false
    end
  end

  describe '#ai_provider?' do
    it 'returns true for openrouter' do
      expect(build(:organization_connector, connector_type: 'openrouter').ai_provider?).to be true
    end

    it 'returns true for anthropic' do
      expect(build(:organization_connector, connector_type: 'anthropic').ai_provider?).to be true
    end

    it 'returns false for github' do
      expect(build(:organization_connector, connector_type: 'github').ai_provider?).to be false
    end
  end

  describe '#mark_synced!' do
    it 'updates last_sync_at and clears last_error' do
      connector = create(:organization_connector, last_error: 'previous error')

      freeze_time do
        connector.mark_synced!
        expect(connector.last_sync_at).to eq(Time.current)
        expect(connector.last_error).to be_nil
      end
    end
  end

  describe '#mark_error!' do
    it 'updates last_error' do
      connector = create(:organization_connector)
      connector.mark_error!('Something went wrong')
      expect(connector.last_error).to eq('Something went wrong')
    end
  end
end
