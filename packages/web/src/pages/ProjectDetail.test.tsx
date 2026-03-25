import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { ProjectDetail } from './ProjectDetail';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'proj-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
    isLoading: false,
  }),
}));

const mockUseProject = vi.fn();
const mockUseEvents = vi.fn();
const mockUseEvent = vi.fn();
const mockUseDeleteProject = vi.fn();
const mockUseProjectDailyByTool = vi.fn();
const mockUseProjectRepositories = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
  useDeleteProject: () => mockUseDeleteProject(),
  useProjectDailyByTool: (...args: unknown[]) => mockUseProjectDailyByTool(...args),
  useProjectRepositories: (...args: unknown[]) => mockUseProjectRepositories(...args),
}));

const mockProject = {
  id: 'proj-1',
  name: 'My Project',
  description: 'A test project',
  isActive: true,
  eventCount: 42,
  totalCostUsd: 12.5,
  createdAt: '2026-01-15T00:00:00Z',
  lastEventAt: '2026-03-20T10:30:00Z',
};

function setupDefaultMocks() {
  mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
  mockUseEvents.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockUseEvent.mockReturnValue({ data: undefined, isLoading: false });
  mockUseDeleteProject.mockReturnValue({ mutateAsync: vi.fn() });
  mockUseProjectDailyByTool.mockReturnValue({ data: undefined, isLoading: false });
  mockUseProjectRepositories.mockReturnValue({ data: undefined, isLoading: false });
}

describe('ProjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows loading skeleton while project is loading', () => {
    mockUseProject.mockReturnValue({ data: undefined, isLoading: true });
    render(<ProjectDetail />);

    expect(screen.queryByText('My Project')).not.toBeInTheDocument();
  });

  it('shows not found when project is null', () => {
    mockUseProject.mockReturnValue({ data: null, isLoading: false });
    render(<ProjectDetail />);

    expect(screen.getByText('Project not found')).toBeInTheDocument();
  });

  it('renders project name and description', () => {
    render(<ProjectDetail />);

    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('A test project')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    render(<ProjectDetail />);

    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Activity')).toBeInTheDocument();
  });

  it('renders Recent Events section', () => {
    render(<ProjectDetail />);

    expect(screen.getByText('Recent Events')).toBeInTheDocument();
  });

  it('does not render Team section on the overview', () => {
    render(<ProjectDetail />);

    expect(screen.queryByText('Team')).not.toBeInTheDocument();
  });

  it('navigates to settings when Settings menu item is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectDetail />);

    await user.click(screen.getByRole('button', { name: '' }));
    await user.click(screen.getByText('Settings'));

    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1/settings');
  });

  describe('Active badge', () => {
    it('shows Active badge for active project', () => {
      render(<ProjectDetail />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows Inactive badge for inactive project', () => {
      mockUseProject.mockReturnValue({
        data: { ...mockProject, isActive: false },
        isLoading: false,
      });
      render(<ProjectDetail />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });
});
