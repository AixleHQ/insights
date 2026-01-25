require 'rails_helper'

RSpec.describe User, type: :model do
  describe 'associations' do
    it { should have_many(:organization_memberships).dependent(:destroy) }
    it { should have_many(:organizations).through(:organization_memberships) }
    it { should have_many(:project_memberships).dependent(:destroy) }
    it { should have_many(:projects).through(:project_memberships) }
    it { should have_many(:owned_projects).class_name('Project').with_foreign_key(:owner_id).dependent(:nullify) }
    it { should have_many(:user_settings).dependent(:destroy) }
    it { should have_many(:admin_audit_logs).with_foreign_key(:admin_user_id).dependent(:restrict_with_error) }

    # Note: tool_events association uses timeseries schema, tested separately
  end

  describe 'validations' do
    subject { build(:user) }

    it { should validate_presence_of(:keycloak_sub) }
    it { should validate_uniqueness_of(:keycloak_sub) }
    it { should validate_presence_of(:email) }
    it { should validate_uniqueness_of(:email) }

    it 'validates email format' do
      user = build(:user, email: 'invalid-email')
      expect(user).not_to be_valid
      expect(user.errors[:email]).to be_present
    end

    it 'accepts valid email format' do
      user = build(:user, email: 'valid@example.com')
      expect(user).to be_valid
    end

    it { should allow_value(true).for(:global_admin) }
    it { should allow_value(false).for(:global_admin) }
  end

  describe 'scopes' do
    describe '.global_admins' do
      it 'returns only global admin users' do
        admin = create(:user, :global_admin)
        regular = create(:user)

        expect(User.global_admins).to include(admin)
        expect(User.global_admins).not_to include(regular)
      end
    end

    describe '.active_in_organization' do
      it 'returns users that are members of the organization' do
        org = create(:organization)
        member = create(:user)
        non_member = create(:user)
        create(:organization_membership, user: member, organization: org)

        expect(User.active_in_organization(org)).to include(member)
        expect(User.active_in_organization(org)).not_to include(non_member)
      end
    end
  end

  describe '#display_name' do
    it 'returns name if present' do
      user = build(:user, name: 'John Doe', email: 'john@example.com')
      expect(user.display_name).to eq('John Doe')
    end

    it 'returns email username if name is blank' do
      user = build(:user, name: nil, email: 'john@example.com')
      expect(user.display_name).to eq('john')
    end
  end

  describe '#member_of?' do
    let(:user) { create(:user) }
    let(:organization) { create(:organization) }

    it 'returns true when user is a member' do
      create(:organization_membership, user: user, organization: organization)
      expect(user.member_of?(organization)).to be true
    end

    it 'returns false when user is not a member' do
      expect(user.member_of?(organization)).to be false
    end
  end

  describe '#role_in' do
    let(:user) { create(:user) }
    let(:organization) { create(:organization) }

    it 'returns the role when user is a member' do
      create(:organization_membership, user: user, organization: organization, role: 'admin')
      expect(user.role_in(organization)).to eq('admin')
    end

    it 'returns nil when user is not a member' do
      expect(user.role_in(organization)).to be_nil
    end
  end

  describe '#admin_of?' do
    let(:user) { create(:user) }
    let(:organization) { create(:organization) }

    it 'returns true for owner' do
      create(:organization_membership, user: user, organization: organization, role: 'owner')
      expect(user.admin_of?(organization)).to be true
    end

    it 'returns true for admin' do
      create(:organization_membership, user: user, organization: organization, role: 'admin')
      expect(user.admin_of?(organization)).to be true
    end

    it 'returns false for member' do
      create(:organization_membership, user: user, organization: organization, role: 'member')
      expect(user.admin_of?(organization)).to be false
    end

    it 'returns false for non-member' do
      expect(user.admin_of?(organization)).to be false
    end
  end
end
