require 'rails_helper'

RSpec.describe Repository, type: :model do
  describe 'associations' do
    it { should belong_to(:project) }
    it { should belong_to(:organization_connector) }

    # Note: tool_events association uses timeseries schema, tested separately
  end

  describe 'validations' do
    subject { build(:repository) }

    it { should validate_presence_of(:external_id) }

    it 'validates uniqueness of external_id per connector' do
      repo = create(:repository)
      duplicate = build(:repository, organization_connector: repo.organization_connector, external_id: repo.external_id)
      expect(duplicate).not_to be_valid
    end

    it { should validate_presence_of(:name) }
    it { should validate_presence_of(:full_name) }
  end

  describe 'scopes' do
    describe '.private_repos' do
      it 'returns only private repositories' do
        private_repo = create(:repository, :private)
        public_repo = create(:repository, is_private: false)

        expect(Repository.private_repos).to include(private_repo)
        expect(Repository.private_repos).not_to include(public_repo)
      end
    end

    describe '.public_repos' do
      it 'returns only public repositories' do
        private_repo = create(:repository, :private)
        public_repo = create(:repository, is_private: false)

        expect(Repository.public_repos).not_to include(private_repo)
        expect(Repository.public_repos).to include(public_repo)
      end
    end

    describe '.recently_synced' do
      it 'returns repositories synced within the last hour' do
        recent = create(:repository, last_sync_at: 30.minutes.ago)
        old = create(:repository, last_sync_at: 2.hours.ago)
        never = create(:repository, last_sync_at: nil)

        expect(Repository.recently_synced).to include(recent)
        expect(Repository.recently_synced).not_to include(old)
        expect(Repository.recently_synced).not_to include(never)
      end
    end
  end

  describe '#needs_sync?' do
    it 'returns true when never synced' do
      repo = build(:repository, last_sync_at: nil)
      expect(repo.needs_sync?).to be true
    end

    it 'returns true when synced more than an hour ago' do
      repo = build(:repository, last_sync_at: 2.hours.ago)
      expect(repo.needs_sync?).to be true
    end

    it 'returns false when synced within the last hour' do
      repo = build(:repository, last_sync_at: 30.minutes.ago)
      expect(repo.needs_sync?).to be false
    end
  end

  describe '#mark_synced!' do
    it 'updates last_sync_at to current time' do
      repo = create(:repository)

      freeze_time do
        repo.mark_synced!
        expect(repo.last_sync_at).to eq(Time.current)
      end
    end
  end

  describe '#provider' do
    it 'returns the connector type' do
      connector = create(:organization_connector, connector_type: 'github')
      repo = build(:repository, organization_connector: connector)
      expect(repo.provider).to eq('github')
    end
  end
end
