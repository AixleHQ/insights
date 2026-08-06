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
    it { should have_many(:actor_organization_audit_logs).class_name('OrganizationAuditLog').with_foreign_key(:actor_id).dependent(:nullify) }
    it { should have_many(:actor_project_audit_logs).class_name('ProjectAuditLog').with_foreign_key(:actor_id).dependent(:nullify) }
    it { should have_many(:assigned_issues).class_name('Issue').with_foreign_key(:assignee_id).dependent(:nullify) }
    it { should have_many(:notification_routes_as_recipient).class_name('NotificationRoute').with_foreign_key(:recipient_user_id).dependent(:nullify) }
    it { should have_many(:updated_organization_retention_policies).class_name('OrganizationRetentionPolicy').with_foreign_key(:updated_by_id).dependent(:nullify) }
    it { should have_many(:updated_project_retention_policies).class_name('ProjectRetentionPolicy').with_foreign_key(:updated_by_id).dependent(:nullify) }
    it { should have_many(:created_scheduled_exports).class_name('ScheduledExport').with_foreign_key(:created_by_id).dependent(:restrict_with_error) }

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

  describe '#all_owned_projects' do
    let(:user) { create(:user) }

    it 'includes personal projects owned via owner_id' do
      personal = create(:project, :personal, owner: user)

      expect(user.all_owned_projects).to include(personal)
    end

    it 'includes org projects where the user has the owner role' do
      org = create(:organization)
      create(:organization_membership, user: user, organization: org)
      org_project = create(:project, organization: org)
      create(:project_membership, :owner, user: user, project: org_project)

      expect(user.all_owned_projects).to include(org_project)
    end

    it 'excludes org projects where the user is a member or viewer' do
      org = create(:organization)
      create(:organization_membership, user: user, organization: org)
      member_project = create(:project, organization: org)
      viewer_project = create(:project, organization: org)
      create(:project_membership, user: user, project: member_project, role: 'member')
      create(:project_membership, :viewer, user: user, project: viewer_project)

      expect(user.all_owned_projects).not_to include(member_project, viewer_project)
    end

    it 'returns no duplicates' do
      personal = create(:project, :personal, owner: user)
      org = create(:organization)
      create(:organization_membership, user: user, organization: org)
      org_project = create(:project, organization: org)
      create(:project_membership, :owner, user: user, project: org_project)

      result = user.all_owned_projects.to_a
      expect(result).to contain_exactly(personal, org_project)
    end

    it 'returns none for an unpersisted user' do
      create(:project, organization: create(:organization))

      expect(User.new.all_owned_projects).to be_empty
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
      create(:organization_membership, user: user, organization: organization, role: 'member')
      expect(user.role_in(organization)).to eq('member')
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

    it 'returns false for member' do
      create(:organization_membership, user: user, organization: organization, role: 'member')
      expect(user.admin_of?(organization)).to be false
    end

    it 'returns false for non-member' do
      expect(user.admin_of?(organization)).to be false
    end
  end
end
