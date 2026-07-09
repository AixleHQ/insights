require 'rails_helper'

RSpec.describe Project, type: :model do
  describe 'associations' do
    it { should have_many(:retention_purge_logs).dependent(:restrict_with_error) }
  end

  describe '.normalize_git_remote' do
    it 'returns nil for blank input' do
      expect(described_class.normalize_git_remote(nil)).to be_nil
      expect(described_class.normalize_git_remote('')).to be_nil
      expect(described_class.normalize_git_remote('   ')).to be_nil
    end

    it 'normalizes GitHub SCP-style SSH to canonical HTTPS without .git suffix' do
      expect(described_class.normalize_git_remote('git@github.com:owner/repo.git')).to eq('https://github.com/owner/repo')
    end

    it 'normalizes SCP-style SSH case-insensitively for the git@ prefix' do
      expect(described_class.normalize_git_remote('GIT@github.com:owner/repo.git')).to eq('https://github.com/owner/repo')
    end

    it 'normalizes HTTPS with .git suffix to the same canonical form as SSH' do
      ssh = 'git@github.com:owner/repo.git'
      https = 'https://github.com/owner/repo.git'
      expect(described_class.normalize_git_remote(ssh)).to eq(described_class.normalize_git_remote(https))
      expect(described_class.normalize_git_remote(https)).to eq('https://github.com/owner/repo')
    end

    it 'normalizes GitLab SCP-style SSH to canonical HTTPS' do
      expect(described_class.normalize_git_remote('git@gitlab.com:group/project.git')).to eq('https://gitlab.com/group/project')
    end

    it 'strips whitespace before matching and normalizing' do
      expect(described_class.normalize_git_remote("  git@github.com:owner/repo.git  \n")).to eq('https://github.com/owner/repo')
    end

    it 'preserves non-SSH URLs with strip, downcase, and .git removal only' do
      expect(described_class.normalize_git_remote('HTTPS://Example.COM/foo/bar.GIT')).to eq('https://example.com/foo/bar')
    end

    it 'normalizes ssh:// scheme URLs to canonical HTTPS' do
      expect(described_class.normalize_git_remote('ssh://git@github.com/owner/repo.git')).to eq('https://github.com/owner/repo')
    end

    it 'strips embedded credentials' do
      expect(described_class.normalize_git_remote('https://x-access-token:SECRET@github.com/owner/repo.git')).to eq('https://github.com/owner/repo')
    end

    it 'strips ports' do
      expect(described_class.normalize_git_remote('ssh://git@github.com:22/owner/repo.git')).to eq('https://github.com/owner/repo')
    end

    it 'strips trailing slashes, including after a .git suffix' do
      expect(described_class.normalize_git_remote('https://github.com/owner/repo/')).to eq('https://github.com/owner/repo')
      expect(described_class.normalize_git_remote('https://github.com/owner/repo.git/')).to eq('https://github.com/owner/repo')
    end

    it 'preserves the host for SSH aliases (path fallback handles them, not normalization)' do
      expect(described_class.normalize_git_remote('git@github-work:owner/repo.git')).to eq('https://github-work/owner/repo')
    end
  end

  describe '.git_remote_path' do
    it 'returns the host-agnostic owner/repo path' do
      expect(described_class.git_remote_path('https://github.com/owner/repo')).to eq('owner/repo')
      expect(described_class.git_remote_path('https://github-work/owner/repo')).to eq('owner/repo')
    end

    it 'returns nil for blank input' do
      expect(described_class.git_remote_path(nil)).to be_nil
      expect(described_class.git_remote_path('')).to be_nil
    end
  end

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

    context 'git_remote_url uniqueness' do
      it 'allows the same git_remote_url in different organizations' do
        url = 'git@github.com:org/repo.git'
        create(:project, git_remote_url: url)
        duplicate = build(:project, git_remote_url: url, organization: create(:organization))
        expect(duplicate).to be_valid
      end

      it 'rejects duplicate git_remote_url within the same organization' do
        org = create(:organization)
        existing = create(:project, organization: org, git_remote_url: 'git@github.com:org/repo.git')
        duplicate = build(:project, organization: org, git_remote_url: 'git@github.com:org/repo.git')
        expect(duplicate).not_to be_valid
        expect(duplicate.errors[:git_remote_url].first).to include(existing.name)
      end

      it 'rejects duplicate git_remote_url for the same personal owner' do
        user = create(:user)
        existing = create(:project, :personal, owner: user, git_remote_url: 'git@github.com:user/repo.git')
        duplicate = build(:project, :personal, owner: user, git_remote_url: 'git@github.com:user/repo.git')
        expect(duplicate).not_to be_valid
        expect(duplicate.errors[:git_remote_url].first).to include(existing.name)
      end

      it 'allows nil git_remote_url in the same organization' do
        org = create(:organization)
        create(:project, organization: org, git_remote_url: nil)
        second = build(:project, organization: org, git_remote_url: nil)
        expect(second).to be_valid
      end
    end

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
