import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ProjectTeamSection } from './ProjectTeamSection';
import type { ProjectMember } from '@/hooks/useApi';

const mockMembers: ProjectMember[] = [
  {
    id: '1',
    userId: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Johnson',
    avatarUrl: 'https://example.com/avatar1.jpg',
    role: 'owner',
    joinedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    userId: 'user-2',
    email: 'bob@example.com',
    name: null,
    avatarUrl: null,
    role: 'member',
    joinedAt: '2024-01-20T10:00:00Z',
  },
];

const renderComponent = (props: Partial<Parameters<typeof ProjectTeamSection>[0]> = {}) => {
  return render(
    <BrowserRouter>
      <ProjectTeamSection members={mockMembers} {...props} />
    </BrowserRouter>
  );
};

describe('ProjectTeamSection', () => {
  describe('Initial Render', () => {
    it('renders the component with title', () => {
      renderComponent();
      expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('displays member count correctly', () => {
      renderComponent();
      expect(screen.getByText('2 members')).toBeInTheDocument();
    });

    it('displays singular member text for single member', () => {
      renderComponent({ members: [mockMembers[0]] });
      expect(screen.getByText('1 member')).toBeInTheDocument();
    });
  });

  describe('Member Display', () => {
    it('renders member names', () => {
      renderComponent();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    it('falls back to email prefix when name is null', () => {
      renderComponent();
      expect(screen.getByText('bob')).toBeInTheDocument();
    });

    it('displays role badges', () => {
      renderComponent();
      expect(screen.getByText('owner')).toBeInTheDocument();
      expect(screen.getByText('member')).toBeInTheDocument();
    });

    it('renders links to member profiles', () => {
      renderComponent();
      const links = screen.getAllByRole('link');
      expect(links.length).toBe(2);
      expect(links[0]).toHaveAttribute('href', '/team/user-1');
      expect(links[1]).toHaveAttribute('href', '/team/user-2');
    });
  });

  describe('Avatar Display', () => {
    it('renders fallback initials when name is provided', () => {
      renderComponent();
      expect(screen.getByText('AJ')).toBeInTheDocument();
    });

    it('renders fallback initials from email when name is null', () => {
      renderComponent();
      expect(screen.getByText('BO')).toBeInTheDocument();
    });

    it('has avatar container for each member', () => {
      const { container } = renderComponent();
      const avatars = container.querySelectorAll('[data-slot="avatar"]');
      expect(avatars.length).toBe(2);
    });
  });

  describe('Loading State', () => {
    it('shows loading text when isLoading is true', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByText('Loading team members...')).toBeInTheDocument();
    });

    it('shows skeleton loaders when loading', () => {
      const { container } = renderComponent({ isLoading: true });
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no members', () => {
      renderComponent({ members: [] });
      expect(screen.getByText('No team members assigned to this project')).toBeInTheDocument();
    });

    it('shows empty message when members is undefined', () => {
      renderComponent({ members: undefined });
      expect(screen.getByText('No team members assigned to this project')).toBeInTheDocument();
    });

    it('displays 0 members count', () => {
      renderComponent({ members: [] });
      expect(screen.getByText('0 members')).toBeInTheDocument();
    });
  });

  describe('Role Badge Colors', () => {
    it('applies correct color class for owner role', () => {
      renderComponent({ members: [mockMembers[0]] });
      const ownerBadge = screen.getByText('owner');
      expect(ownerBadge).toHaveClass('text-violet-400');
    });

    it('applies correct color class for member role', () => {
      renderComponent({ members: [mockMembers[1]] });
      const memberBadge = screen.getByText('member');
      expect(memberBadge).toHaveClass('text-blue-400');
    });

    it('handles admin role', () => {
      const adminMember: ProjectMember = {
        ...mockMembers[0],
        id: '3',
        role: 'admin',
      };
      renderComponent({ members: [adminMember] });
      const adminBadge = screen.getByText('admin');
      expect(adminBadge).toHaveClass('text-amber-400');
    });

    it('handles viewer role', () => {
      const viewerMember: ProjectMember = {
        ...mockMembers[0],
        id: '4',
        role: 'viewer',
      };
      renderComponent({ members: [viewerMember] });
      const viewerBadge = screen.getByText('viewer');
      expect(viewerBadge).toHaveClass('text-slate-400');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to container', () => {
      const { container } = renderComponent({ className: 'custom-class' });
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
