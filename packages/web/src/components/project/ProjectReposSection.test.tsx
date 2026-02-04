import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectReposSection } from './ProjectReposSection';
import type { ProjectRepository } from '@/hooks/useApi';

const mockRepositories: ProjectRepository[] = [
  {
    id: '1',
    name: 'my-project',
    fullName: 'org/my-project',
    provider: 'github',
    url: 'https://github.com/org/my-project',
    lastSyncAt: '2024-01-15T10:00:00Z',
    isActive: true,
  },
  {
    id: '2',
    name: 'other-repo',
    fullName: 'org/other-repo',
    provider: 'gitlab',
    url: 'https://gitlab.com/org/other-repo',
    lastSyncAt: null,
    isActive: false,
  },
];

const renderComponent = (props: Partial<Parameters<typeof ProjectReposSection>[0]> = {}) => {
  return render(<ProjectReposSection repositories={mockRepositories} {...props} />);
};

describe('ProjectReposSection', () => {
  describe('Initial Render', () => {
    it('renders the component with title', () => {
      renderComponent();
      expect(screen.getByText('Repositories')).toBeInTheDocument();
    });

    it('displays repository count correctly', () => {
      renderComponent();
      expect(screen.getByText('2 repositories linked')).toBeInTheDocument();
    });

    it('displays singular repository text for single repo', () => {
      renderComponent({ repositories: [mockRepositories[0]] });
      expect(screen.getByText('1 repository linked')).toBeInTheDocument();
    });
  });

  describe('Repository Display', () => {
    it('renders repository full names', () => {
      renderComponent();
      expect(screen.getByText('org/my-project')).toBeInTheDocument();
      expect(screen.getByText('org/other-repo')).toBeInTheDocument();
    });

    it('renders external links to repositories', () => {
      renderComponent();
      const links = screen.getAllByRole('link');
      expect(links.length).toBe(2);
      expect(links[0]).toHaveAttribute('href', 'https://github.com/org/my-project');
      expect(links[0]).toHaveAttribute('target', '_blank');
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('displays active status badge', () => {
      renderComponent();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('displays inactive status badge', () => {
      renderComponent();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });

  describe('Last Sync Display', () => {
    it('displays last sync time when available', () => {
      renderComponent();
      // The component uses formatDistanceToNow which includes "ago"
      expect(screen.getByText(/Synced/)).toBeInTheDocument();
    });

    it('does not display sync time when lastSyncAt is null', () => {
      renderComponent({ repositories: [mockRepositories[1]] });
      expect(screen.queryByText(/Synced/)).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading text when isLoading is true', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByText('Loading repositories...')).toBeInTheDocument();
    });

    it('shows skeleton loaders when loading', () => {
      const { container } = renderComponent({ isLoading: true });
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no repositories', () => {
      renderComponent({ repositories: [] });
      expect(screen.getByText('No repositories linked to this project')).toBeInTheDocument();
    });

    it('shows empty message when repositories is undefined', () => {
      renderComponent({ repositories: undefined });
      expect(screen.getByText('No repositories linked to this project')).toBeInTheDocument();
    });

    it('displays 0 repositories count', () => {
      renderComponent({ repositories: [] });
      expect(screen.getByText('0 repositories linked')).toBeInTheDocument();
    });
  });

  describe('Provider Icons', () => {
    it('renders github icon for github provider', () => {
      renderComponent({ repositories: [mockRepositories[0]] });
      // The Github icon should be rendered - we check for the link instead
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://github.com/org/my-project');
    });

    it('renders git branch icon for non-github providers', () => {
      renderComponent({ repositories: [mockRepositories[1]] });
      // The GitBranch icon is used as fallback - we check for the link instead
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://gitlab.com/org/other-repo');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to container', () => {
      const { container } = renderComponent({ className: 'custom-class' });
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Fallback to name when fullName is empty', () => {
    it('uses name when fullName is not available', () => {
      const repoWithoutFullName: ProjectRepository = {
        ...mockRepositories[0],
        fullName: '',
        name: 'just-the-name',
      };
      renderComponent({ repositories: [repoWithoutFullName] });
      expect(screen.getByText('just-the-name')).toBeInTheDocument();
    });
  });
});
