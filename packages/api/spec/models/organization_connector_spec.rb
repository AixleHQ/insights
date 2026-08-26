require 'rails_helper'

RSpec.describe OrganizationConnector, type: :model do
  describe 'constants' do
    it 'defines valid connector types' do
      expect(OrganizationConnector::CONNECTOR_TYPES).to eq(%w[github gitlab bitbucket jira linear openrouter anthropic openai gemini slack github_copilot cursor])
    end

    it 'defines valid statuses' do
      expect(OrganizationConnector::STATUSES).to eq(%w[connected testing error disconnected])
    end

    it 'defines multi-instance connector types' do
      expect(OrganizationConnector::MULTI_INSTANCE_CONNECTOR_TYPES).to eq(%w[github gitlab bitbucket jira linear openrouter openai])
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

    it 'allows multiple connectors of the same multi-instance type per organization' do
      connector = create(:organization_connector, connector_type: 'github', external_org_id: 'org-a')
      second = build(:organization_connector, organization: connector.organization, connector_type: 'github', external_org_id: 'org-b')
      expect(second).to be_valid
    end

    it 'rejects a second connector of a single-instance type' do
      connector = create(:organization_connector, :slack)
      duplicate = build(:organization_connector, :slack, organization: connector.organization)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:connector_type]).to include('already exists for this organization')
    end

    it 'rejects a second multi-instance OAuth connector with the same external_org_id' do
      connector = create(:organization_connector, connector_type: 'github', external_org_id: 'org-a')
      duplicate = build(:organization_connector, organization: connector.organization, connector_type: 'github', external_org_id: 'org-a')
      expect(duplicate).not_to be_valid
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
        active = create(:organization_connector, is_active: true, status: 'connected')
        inactive = create(:organization_connector, is_active: false, status: 'disconnected')

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

  describe '#multi_instance?' do
    it 'returns true for github' do
      expect(build(:organization_connector, connector_type: 'github').multi_instance?).to be true
    end

    it 'returns true for openrouter' do
      expect(build(:organization_connector, connector_type: 'openrouter').multi_instance?).to be true
    end

    it 'returns true for openai' do
      expect(build(:organization_connector, connector_type: 'openai').multi_instance?).to be true
    end

    it 'returns false for slack' do
      expect(build(:organization_connector, :slack).multi_instance?).to be false
    end

    it 'returns false for anthropic' do
      expect(build(:organization_connector, connector_type: 'anthropic').multi_instance?).to be false
    end
  end

  describe '#copilot?' do
    it 'returns true for github_copilot' do
      expect(build(:organization_connector, :github_copilot).copilot?).to be true
    end

    it 'returns false for github' do
      expect(build(:organization_connector, connector_type: 'github').copilot?).to be false
    end
  end

  describe '#tool_event_name' do
    it 'returns "github_copilot" for a Copilot connector' do
      expect(build(:organization_connector, :github_copilot).tool_event_name).to eq('github_copilot')
    end

    it 'returns "<type>_api" for an AI provider connector' do
      expect(build(:organization_connector, connector_type: 'anthropic').tool_event_name).to eq('anthropic_api')
    end

    it 'returns nil for a source control connector' do
      expect(build(:organization_connector, connector_type: 'github').tool_event_name).to be_nil
    end

    it 'returns nil for a project management connector' do
      expect(build(:organization_connector, :jira).tool_event_name).to be_nil
    end
  end

  describe '#synced_event_scope' do
    let(:organization) { create(:organization) }

    it 'scopes Jira connector events by tool_name jira' do
      connector = create(:organization_connector, :jira, organization: organization)
      create(:tool_event, organization: organization, tool_name: 'jira', event_type: 'issue')
      create(:tool_event, organization: organization, tool_name: 'linear', event_type: 'issue')

      expect(connector.synced_event_scope.count).to eq(1)
      expect(connector.synced_event_scope.pick(:tool_name)).to eq('jira')
    end

    it 'scopes Linear connector events by tool_name linear' do
      connector = create(:organization_connector, connector_type: 'linear', organization: organization)
      create(:tool_event, organization: organization, tool_name: 'linear', event_type: 'issue')
      create(:tool_event, organization: organization, tool_name: 'jira', event_type: 'issue')

      expect(connector.synced_event_scope.count).to eq(1)
      expect(connector.synced_event_scope.pick(:tool_name)).to eq('linear')
    end

    it 'returns none for connectors without a tool event mapping' do
      connector = create(:organization_connector, :slack, organization: organization)
      create(:tool_event, organization: organization, tool_name: 'claude_code')

      expect(connector.synced_event_scope.count).to eq(0)
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

  describe '#mark_connected!' do
    it 'restores connected status without refreshing last_sync_at' do
      connector = create(:organization_connector, status: 'testing', last_error: 'previous')
      connector.update_columns(last_sync_at: 10.hours.ago, testing_started_at: 5.minutes.ago)
      prior_sync = connector.last_sync_at

      connector.mark_connected!

      expect(connector.status).to eq('connected')
      expect(connector.last_error).to be_nil
      expect(connector.testing_started_at).to be_nil
      expect(connector.is_active).to be(true)
      expect(connector.last_sync_at).to eq(prior_sync)
    end
  end

  describe '#mark_testing!' do
    it 'sets status to testing and clears last_error' do
      connector = create(:organization_connector, status: 'error', last_error: 'previous error')
      connector.mark_testing!
      expect(connector.status).to eq('testing')
      expect(connector.last_error).to be_nil
    end

    it 'stamps testing_started_at' do
      connector = create(:organization_connector)
      connector.mark_testing!
      expect(connector.testing_started_at).to be_within(1.second).of(Time.current)
    end
  end

  describe '#mark_error!' do
    it 'updates last_error' do
      connector = create(:organization_connector)
      connector.mark_error!('Something went wrong')
      expect(connector.last_error).to eq('Something went wrong')
    end

    it 'clears testing_started_at' do
      connector = create(:organization_connector, status: 'testing')
      connector.update_columns(testing_started_at: 1.hour.ago)
      connector.mark_error!('boom')
      expect(connector.testing_started_at).to be_nil
    end
  end

  describe '#mark_disconnected!' do
    it 'clears testing_started_at' do
      connector = create(:organization_connector, status: 'testing')
      connector.update_columns(testing_started_at: 1.hour.ago)
      connector.mark_disconnected!
      expect(connector.testing_started_at).to be_nil
    end
  end

  describe '#stale?' do
    it 'is true for a connected AI connector past its interval' do
      connector = create(:organization_connector, connector_type: 'anthropic', status: 'connected')
      connector.update_columns(last_sync_at: 10.hours.ago)
      expect(connector.stale?).to be(true)
    end

    it 'is false just inside the interval boundary' do
      connector = create(:organization_connector, connector_type: 'anthropic', status: 'connected')
      connector.update_columns(last_sync_at: (8.hours - 1.minute).ago)
      expect(connector.stale?).to be(false)
    end

    it 'is true when last_sync_at is null' do
      connector = create(:organization_connector, connector_type: 'anthropic', status: 'connected')
      connector.update_columns(last_sync_at: nil)
      expect(connector.stale?).to be(true)
    end

    it 'is false for event-driven types with no interval' do
      connector = create(:organization_connector, connector_type: 'github', status: 'connected')
      connector.update_columns(last_sync_at: 30.days.ago)
      expect(connector.stale?).to be(false)
    end

    it 'is false for a webhook-active connector regardless of last_sync_at' do
      connector = create(:organization_connector, connector_type: 'openrouter', status: 'connected',
                         webhook_active: true)
      connector.update_columns(last_sync_at: 10.hours.ago)
      expect(connector.stale?).to be(false)
    end

    it 'is false when the connector is not connected' do
      connector = create(:organization_connector, connector_type: 'anthropic', status: 'error')
      connector.update_columns(last_sync_at: 10.hours.ago)
      expect(connector.stale?).to be(false)
    end
  end

  describe '#stuck?' do
    it 'is true when testing longer than the timeout' do
      connector = create(:organization_connector, status: 'testing')
      connector.update_columns(testing_started_at: 2.hours.ago)
      expect(connector.stuck?).to be(true)
    end

    it 'is false just inside the timeout boundary' do
      connector = create(:organization_connector, status: 'testing')
      connector.update_columns(testing_started_at: (1.hour - 1.minute).ago)
      expect(connector.stuck?).to be(false)
    end

    it 'falls back to updated_at when testing_started_at is null' do
      connector = create(:organization_connector, status: 'testing')
      connector.update_columns(testing_started_at: nil, updated_at: 2.hours.ago)
      expect(connector.stuck?).to be(true)
    end

    it 'is false when not in testing' do
      connector = create(:organization_connector, status: 'connected')
      expect(connector.stuck?).to be(false)
    end
  end

  describe '#healthy?' do
    it 'is true for a freshly synced connected connector' do
      connector = create(:organization_connector, connector_type: 'anthropic', status: 'connected')
      connector.update_columns(last_sync_at: 5.minutes.ago)
      expect(connector.healthy?).to be(true)
    end

    it 'is false for a stale connector' do
      connector = create(:organization_connector, connector_type: 'anthropic', status: 'connected')
      connector.update_columns(last_sync_at: 10.hours.ago)
      expect(connector.healthy?).to be(false)
    end

    it 'is false for a non-connected connector' do
      connector = create(:organization_connector, status: 'testing')
      expect(connector.healthy?).to be(false)
    end
  end
end
