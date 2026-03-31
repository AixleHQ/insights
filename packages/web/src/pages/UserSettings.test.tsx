import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserSettings } from './UserSettings';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Test User', email: 'test@example.com' },
  }),
}));

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useApi', () => {
  const mockUser = {
    id: 'u1',
    email: 'test@example.com',
    name: 'Test User',
    avatar_url: null as string | null,
    role: 'member' as const,
    super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  return {
  useToolAccounts: () => ({ data: [], isLoading: false }),
  useCreateToolAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteToolAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOrganizationMembers: () => ({
    data: [
      {
        id: 'member-m1',
        user_id: 'u1',
        organization_id: 'test-org-id',
        role: 'member' as const,
        user: mockUser,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  }),
  useMember: () => ({
    data: {
      id: 'member-m1',
      user_id: 'u1',
      organization_id: 'test-org-id',
      role: 'member' as const,
      user: mockUser,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    isLoading: false,
  }),
  useMemberStats: () => ({
    data: {
      total_events: 0,
      total_cost: 0,
      events_today: 0,
      events_this_week: 0,
      events_this_month: 0,
      most_used_tool: null,
      tokens: { total_in: 0, total_out: 0, total: 0 },
      tool_breakdown: [],
      model_breakdown: [],
      daily_activity: [],
      projects: [],
      organizations: [],
      tool_accounts: [],
    },
  }),
  useMemberEvents: () => ({
    data: { data: [] },
    isLoading: false,
  }),
  };
});

function renderAtPath(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile/*" element={<UserSettings />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header', () => {
    it('renders the page heading', () => {
      renderAtPath('/profile');
      expect(screen.getByRole('heading', { name: 'User Settings' })).toBeInTheDocument();
    });
  });

  describe('Sidebar navigation', () => {
    it('renders all 5 nav links', () => {
      renderAtPath('/profile');

      expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /preferences/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /security/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /tools/i })).toBeInTheDocument();
    });

    it('marks Profile as active on the index route', () => {
      renderAtPath('/profile');

      expect(screen.getByRole('link', { name: /profile/i }).className).toMatch(/text-primary/);
    });

    it('marks Preferences as active on /profile/settings', () => {
      renderAtPath('/profile/settings');

      expect(screen.getByRole('link', { name: /preferences/i }).className).toMatch(/text-primary/);
    });

    it('marks Notifications as active on /profile/settings/notifications', () => {
      renderAtPath('/profile/settings/notifications');

      expect(screen.getByRole('link', { name: /notifications/i }).className).toMatch(/text-primary/);
    });

    it('marks Security as active on /profile/settings/security', () => {
      renderAtPath('/profile/settings/security');

      expect(screen.getByRole('link', { name: /security/i }).className).toMatch(/text-primary/);
    });

    it('marks Tools as active on /profile/tools', () => {
      renderAtPath('/profile/tools');

      expect(screen.getByRole('link', { name: /tools/i }).className).toMatch(/text-primary/);
    });
  });

  describe('Section content', () => {
    it('renders profile info on the index route', () => {
      renderAtPath('/profile');

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('renders embedded org member activity below the profile card', () => {
      renderAtPath('/profile');

      expect(screen.getByText('Total Events')).toBeInTheDocument();
    });

    it('renders Preferences section at /profile/settings', () => {
      renderAtPath('/profile/settings');

      expect(screen.getByText('Preference settings coming soon.')).toBeInTheDocument();
    });

    it('renders Notifications section at /profile/settings/notifications', () => {
      renderAtPath('/profile/settings/notifications');

      expect(screen.getByText('Notification settings coming soon.')).toBeInTheDocument();
    });

    it('renders Security section at /profile/settings/security', () => {
      renderAtPath('/profile/settings/security');

      expect(screen.getByText('Security settings coming soon.')).toBeInTheDocument();
    });

    it('renders Tools section at /profile/tools', () => {
      renderAtPath('/profile/tools');

      expect(screen.getByText('Available Integrations')).toBeInTheDocument();
    });

    it('does not render ToolAccounts back button when embedded', () => {
      renderAtPath('/profile/tools');

      expect(screen.queryByRole('link', { name: /back to settings/i })).not.toBeInTheDocument();
    });
  });
});
