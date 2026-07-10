require 'rails_helper'

RSpec.describe Organization, type: :model do
  describe 'associations' do
    it { should have_many(:organization_memberships).dependent(:destroy) }
    it { should have_many(:members).through(:organization_memberships).source(:user) }
    it { should have_many(:organization_settings).dependent(:destroy) }
    it { should have_one(:retention_policy).class_name('OrganizationRetentionPolicy').dependent(:destroy) }
    it { should have_many(:organization_connectors).dependent(:destroy) }
    it { should have_many(:projects).dependent(:destroy) }
    it { should have_many(:audit_logs).dependent(:restrict_with_error) }
    it { should have_many(:retention_purge_logs).dependent(:restrict_with_error) }

    # Note: tool_events association uses timeseries schema, tested separately
  end

  describe 'validations' do
    subject { build(:organization) }

    it { should validate_presence_of(:name) }

    # Note: slug is auto-generated on create, so presence validation
    # is tested differently
    it 'auto-generates slug from name when not provided' do
      org = Organization.new(name: 'Test Organization')
      org.valid?
      expect(org.slug).to eq('test-organization')
    end

    it { should validate_uniqueness_of(:slug) }

    it 'validates slug format' do
      org = build(:organization, slug: 'Invalid Slug!')
      expect(org).not_to be_valid
      expect(org.errors[:slug]).to be_present
    end

    it 'accepts valid slug format' do
      org = build(:organization, slug: 'valid-slug-123')
      expect(org).to be_valid
    end

    it { should allow_value(true).for(:is_active) }
    it { should allow_value(false).for(:is_active) }
  end

  describe 'callbacks' do
    describe 'before_validation :generate_slug' do
      it 'generates slug from name on create' do
        org = create(:organization, name: 'My Organization', slug: nil)
        expect(org.slug).to eq('my-organization')
      end

      it 'does not override existing slug' do
        org = create(:organization, name: 'My Organization', slug: 'custom-slug')
        expect(org.slug).to eq('custom-slug')
      end

      it 'handles duplicate slugs by appending counter' do
        create(:organization, name: 'Test Org', slug: 'test-org')
        org2 = create(:organization, name: 'Test Org', slug: nil)
        expect(org2.slug).to eq('test-org-1')
      end
    end

    describe 'after_create :create_default_retention_policy' do
      it 'creates a retention policy on create' do
        org = create(:organization)
        expect(org.retention_policy).to be_present
      end
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only active organizations' do
        active = create(:organization, is_active: true)
        inactive = create(:organization, is_active: false)

        expect(Organization.active).to include(active)
        expect(Organization.active).not_to include(inactive)
      end
    end
  end

  describe '#owners' do
    it 'returns members with owner role' do
      org = create(:organization)
      owner = create(:user)
      member = create(:user)
      create(:organization_membership, organization: org, user: owner, role: 'owner')
      create(:organization_membership, organization: org, user: member, role: 'member')

      expect(org.owners).to include(owner)
      expect(org.owners).not_to include(member)
    end
  end

  describe '#admins' do
    it 'returns only owners (post-AIX-201: admin role removed)' do
      org = create(:organization)
      owner = create(:user)
      member = create(:user)
      viewer = create(:user)
      create(:organization_membership, organization: org, user: owner, role: 'owner')
      create(:organization_membership, organization: org, user: member, role: 'member')
      create(:organization_membership, organization: org, user: viewer, role: 'viewer')

      expect(org.admins).to include(owner)
      expect(org.admins).not_to include(member)
      expect(org.admins).not_to include(viewer)
    end
  end

  describe 'ingest quota validations' do
    subject(:org) { create(:organization) }

    context 'ingest_rate_limit_per_minute' do
      it 'accepts a positive integer' do
        org.ingest_rate_limit_per_minute = '500'
        expect(org).to be_valid
      end

      it 'accepts blank (reverts to default)' do
        org.ingest_rate_limit_per_minute = ''
        expect(org).to be_valid
      end

      it 'rejects zero' do
        org.ingest_rate_limit_per_minute = '0'
        expect(org).not_to be_valid
        expect(org.errors[:ingest_rate_limit_per_minute]).to be_present
      end

      it 'rejects a negative value' do
        org.ingest_rate_limit_per_minute = '-5'
        expect(org).not_to be_valid
      end

      it 'rejects a non-integer string' do
        org.ingest_rate_limit_per_minute = 'abc'
        expect(org).not_to be_valid
      end
    end

    context 'ingest_monthly_event_quota' do
      it 'accepts a positive integer' do
        org.ingest_monthly_event_quota = '10000'
        expect(org).to be_valid
      end

      it 'accepts blank (unlimited)' do
        org.ingest_monthly_event_quota = ''
        expect(org).to be_valid
      end

      it 'rejects zero' do
        org.ingest_monthly_event_quota = '0'
        expect(org).not_to be_valid
      end

      it 'rejects a negative value' do
        org.ingest_monthly_event_quota = '-1'
        expect(org).not_to be_valid
      end
    end
  end

  describe 'ingest quota getters' do
    let(:org) { create(:organization) }

    it 'returns nil when no setting exists' do
      expect(org.ingest_rate_limit_per_minute).to be_nil
      expect(org.ingest_monthly_event_quota).to be_nil
    end

    it 'returns the stored string value from OrganizationSetting' do
      OrganizationSetting.set(org, 'ingest_rate_limit_per_minute', '2000')
      # Use a fresh instance to avoid ivar memoization from previous call
      fresh = Organization.find(org.id)
      expect(fresh.ingest_rate_limit_per_minute).to eq('2000')
    end

    it 'memoizes the value so a second call does not hit the DB again' do
      org.ingest_rate_limit_per_minute # populates ivar
      expect(OrganizationSetting).not_to receive(:get)
      org.ingest_rate_limit_per_minute
    end

    it 'memoizes nil correctly (no repeat DB query when setting is absent)' do
      org.ingest_monthly_event_quota # populates ivar to nil
      expect(OrganizationSetting).not_to receive(:get)
      org.ingest_monthly_event_quota
    end
  end

  describe 'ingest quota persistence (dirty-flag + after_save)' do
    let(:org) { create(:organization) }

    it 'creates an OrganizationSetting on save when rate limit is set' do
      org.ingest_rate_limit_per_minute = '1500'
      expect { org.save! }.to change {
        OrganizationSetting.find_by(organization: org, key: 'ingest_rate_limit_per_minute')&.value
      }.from(nil).to('1500')
    end

    it 'creates an OrganizationSetting on save when quota is set' do
      org.ingest_monthly_event_quota = '50000'
      expect { org.save! }.to change {
        OrganizationSetting.find_by(organization: org, key: 'ingest_monthly_event_quota')&.value
      }.from(nil).to('50000')
    end

    it 'deletes the OrganizationSetting when set to blank (clear-to-default)' do
      OrganizationSetting.set(org, 'ingest_rate_limit_per_minute', '1000')
      org.ingest_rate_limit_per_minute = ''
      expect { org.save! }.to change {
        OrganizationSetting.exists?(organization: org, key: 'ingest_rate_limit_per_minute')
      }.from(true).to(false)
    end

    it 'does not write to OrganizationSetting when the setter was never called (dirty flag clean)' do
      expect(OrganizationSetting).not_to receive(:set)
      org.update!(name: "#{org.name} updated")
    end

    it 'does not persist an invalid value — validation stops before after_save' do
      org.ingest_rate_limit_per_minute = '-99'
      org.save
      expect(OrganizationSetting.find_by(organization: org, key: 'ingest_rate_limit_per_minute')).to be_nil
    end
  end

  describe '#ingest_monthly_event_count' do
    let(:org) { create(:organization) }

    around do |example|
      original = Rails.cache
      Rails.cache = ActiveSupport::Cache::MemoryStore.new
      example.run
    ensure
      Rails.cache = original
    end

    it 'returns 0 when no counter exists in cache' do
      expect(org.ingest_monthly_event_count).to eq(0)
    end

    it 'returns the cached counter value for the current month' do
      month_key = "ingest:quota:#{org.id}:#{Time.current.strftime('%Y-%m')}"
      Rails.cache.write(month_key, 42)
      expect(org.ingest_monthly_event_count).to eq(42)
    end
  end
end
