require 'rails_helper'

RSpec.describe Project, type: :model do
  describe 'associations' do
    it { should belong_to(:organization).optional }
    it { should belong_to(:owner).class_name('User').optional }
    it { should have_many(:project_memberships).dependent(:destroy) }
    it { should have_many(:members).through(:project_memberships).source(:user) }
    it { should have_many(:project_settings).dependent(:destroy) }
    it { should have_many(:repositories).dependent(:destroy) }

    # Note: tool_events association uses timeseries schema, tested separately
  end

  describe 'validations' do
    subject { build(:project) }

    it { should validate_presence_of(:name) }

    # Note: slug is auto-generated on create, so presence validation
    # is tested differently
    it 'auto-generates slug from name when not provided' do
      project = Project.new(name: 'Test Project', organization: create(:organization))
      project.valid?
      expect(project.slug).to eq('test-project')
    end

    it 'validates slug format' do
      project = build(:project, slug: 'Invalid Slug!')
      expect(project).not_to be_valid
      expect(project.errors[:slug]).to be_present
    end

    it { should allow_value(true).for(:is_active) }
    it { should allow_value(false).for(:is_active) }

    context 'organization or owner validation' do
      it 'is invalid without organization or owner' do
        project = build(:project, organization: nil, owner: nil)
        expect(project).not_to be_valid
        expect(project.errors[:base]).to include('Project must belong to an organization or have an owner')
      end

      it 'is invalid with both organization and owner' do
        project = build(:project, organization: create(:organization), owner: create(:user))
        expect(project).not_to be_valid
        expect(project.errors[:base]).to include('Project cannot belong to both an organization and have a personal owner')
      end

      it 'is valid with organization only' do
        project = build(:project, organization: create(:organization), owner: nil)
        expect(project).to be_valid
      end

      it 'is valid with owner only' do
        user = create(:user)
        project = build(:project, organization: nil, owner: user, slug: 'personal-project')
        expect(project).to be_valid
      end
    end
  end

  describe 'callbacks' do
    describe 'before_validation :generate_slug' do
      it 'generates slug from name on create' do
        project = create(:project, name: 'My Project', slug: nil)
        expect(project.slug).to eq('my-project')
      end

      it 'does not override existing slug' do
        project = create(:project, name: 'My Project', slug: 'custom-slug')
        expect(project.slug).to eq('custom-slug')
      end
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only active projects' do
        active = create(:project, is_active: true)
        inactive = create(:project, is_active: false)

        expect(Project.active).to include(active)
        expect(Project.active).not_to include(inactive)
      end
    end

    describe '.organization_projects' do
      it 'returns only organization projects' do
        org_project = create(:project)
        personal_project = create(:project, :personal)

        expect(Project.organization_projects).to include(org_project)
        expect(Project.organization_projects).not_to include(personal_project)
      end
    end

    describe '.personal_projects' do
      it 'returns only personal projects' do
        org_project = create(:project)
        personal_project = create(:project, :personal)

        expect(Project.personal_projects).not_to include(org_project)
        expect(Project.personal_projects).to include(personal_project)
      end
    end
  end

  describe '#personal?' do
    it 'returns true for personal projects' do
      project = create(:project, :personal)
      expect(project.personal?).to be true
    end

    it 'returns false for organization projects' do
      project = build(:project)
      expect(project.personal?).to be false
    end
  end

  describe '#organization_project?' do
    it 'returns true for organization projects' do
      project = create(:project)
      expect(project.organization_project?).to be true
    end

    it 'returns false for personal projects' do
      project = create(:project, :personal)
      expect(project.organization_project?).to be false
    end
  end
end
