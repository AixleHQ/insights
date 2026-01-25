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
      admin = create(:user)
      create(:organization_membership, organization: org, user: owner, role: 'owner')
      create(:organization_membership, organization: org, user: admin, role: 'admin')

      expect(org.owners).to include(owner)
      expect(org.owners).not_to include(admin)
    end
  end

  describe '#admins' do
    it 'returns members with owner or admin role' do
      org = create(:organization)
      owner = create(:user)
      admin = create(:user)
      member = create(:user)
      create(:organization_membership, organization: org, user: owner, role: 'owner')
      create(:organization_membership, organization: org, user: admin, role: 'admin')
      create(:organization_membership, organization: org, user: member, role: 'member')

      expect(org.admins).to include(owner)
      expect(org.admins).to include(admin)
      expect(org.admins).not_to include(member)
    end
  end
end
