import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils';
import { MemberProfileView } from './MemberProfile';

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
    isLoading: false,
  }),
}));

const mockUseMember = vi.fn();
const mockUseMemberStats = vi.fn();
const mockUseMemberEvents = vi.fn();
const mockUseProject = vi.fn();
const mockUseEvents = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useMember: (...args: unknown[]) => mockUseMember(...args),
  useMemberStats: (...args: unknown[]) => mockUseMemberStats(...args),
  useMemberEvents: (...args: unknown[]) => mockUseMemberEvents(...args),
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
}));

const mockMember = {
  id: 'mem-1',
  user_id: 'user-1',
  organization_id: 'org-1',
  role: 'member' as const,
  user: {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Johnson',
    avatarUrl: null,
  },
  created_at: '2024-01-01T00:00:00Z',
};

const mockStats = {
  total_events: 10,
  total_cost: 1.5,
  events_today: 1,
  events_this_week: 3,
  events_this_month: 10,
  most_used_tool: 'claude_code',
  tokens: { total_in: 1000, total_out: 2000, total: 3000 },
  tool_breakdown: [],
  model_breakdown: [],
  daily_activity: [],
  projects: [],
  organizations: [],
  tool_accounts: [],
};

const emptyEventsResponse = {
  data: [],
  meta: { current_page: 1, total_pages: 0, total_count: 0, per_page: 10 },
};

const mockProject = {
  id: 'proj-1',
  name: 'Frontend App',
};

function setupDefaultMocks() {
  mockUseMember.mockReturnValue({ data: mockMember, isLoading: false });
  mockUseMemberStats.mockReturnValue({ data: mockStats });
  mockUseMemberEvents.mockReturnValue({ data: emptyEventsResponse, isLoading: false });
  mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
  mockUseEvents.mockReturnValue({ data: emptyEventsResponse, isLoading: false });
}

describe('MemberProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('without projectId', () => {
    it('renders member name', () => {
      render(<MemberProfileView memberId="mem-1" />);
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    it('does not render project commits section', () => {
      render(<MemberProfileView memberId="mem-1" />);
      expect(screen.queryByText(/Commits in/)).not.toBeInTheDocument();
    });
  });

  describe('with projectId', () => {
    it('renders the project commits section header', () => {
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText('Commits in Frontend App')).toBeInTheDocument();
    });

    it('shows project name from useProject in section header', () => {
      mockUseProject.mockReturnValue({ data: { id: 'proj-2', name: 'Backend API' }, isLoading: false });
      render(<MemberProfileView memberId="mem-1" projectId="proj-2" />);
      expect(screen.getByText('Commits in Backend API')).toBeInTheDocument();
    });

    it('shows fallback header when project name is not yet loaded', () => {
      mockUseProject.mockReturnValue({ data: null, isLoading: true });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText('Commits in Project')).toBeInTheDocument();
    });

    it('shows empty commits table without error when user has no commits', () => {
      mockUseEvents.mockReturnValue({ data: emptyEventsResponse, isLoading: false });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText('Commits in Frontend App')).toBeInTheDocument();
    });

    it('passes project_id and event_type to useEvents', () => {
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(mockUseEvents).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ project_id: 'proj-1', event_type: 'commit' }),
        expect.objectContaining({ enabled: true })
      );
    });

    it('does not enable the commits query when member user_id is not yet available', () => {
      mockUseMember.mockReturnValue({ data: null, isLoading: true });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(mockUseEvents).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ project_id: 'proj-1' }),
        expect.objectContaining({ enabled: false })
      );
    });
  });
});
