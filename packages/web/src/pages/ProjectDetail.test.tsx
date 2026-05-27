import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectDetail } from "./ProjectDetail";

const mockNavigate = vi.fn();
const mockHasRole = vi.fn().mockReturnValue(false);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "proj-1" }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
    currentRole: "member",
    isLoading: false,
    hasRole: mockHasRole,
  }),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useEventsPageUpdates: vi.fn(),
}));

const mockUseProject = vi.fn();
const mockUseEvents = vi.fn();
const mockUseEvent = vi.fn();
const mockUseDeleteProject = vi.fn();
const mockUseProjectDailyByTool = vi.fn();
const mockUseProjectRepositories = vi.fn();
const mockUseProjectMembers = vi.fn();
const mockUseProjectStats = vi.fn();
const mockUseCurrentUser = vi.fn();
const mockUseEventsSummary = vi.fn();
const mockUseExportEvents = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
  useDeleteProject: () => mockUseDeleteProject(),
  useProjectDailyByTool: (...args: unknown[]) => mockUseProjectDailyByTool(...args),
  useProjectRepositories: (...args: unknown[]) => mockUseProjectRepositories(...args),
  useProjectMembers: (...args: unknown[]) => mockUseProjectMembers(...args),
  useProjectStats: (...args: unknown[]) => mockUseProjectStats(...args),
  useCurrentUser: (...args: unknown[]) => mockUseCurrentUser(...args),
  useEventsSummary: (...args: unknown[]) => mockUseEventsSummary(...args),
  useExportEvents: (...args: unknown[]) => mockUseExportEvents(...args),
  useConnectors: () => ({ data: [] }),
  useAvailableRepos: () => ({ data: [], isLoading: false }),
  useConnectRepo: () => ({ mutateAsync: vi.fn() }),
  useDisconnectRepo: () => ({ mutateAsync: vi.fn() }),
  useAddProjectMember: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProjectMember: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveProjectMember: () => ({ mutate: vi.fn(), isPending: false }),
  useOrganizationMembers: () => ({ data: [] }),
}));

const mockProject = {
  id: "proj-1",
  name: "My Project",
  description: "A test project",
  isActive: true,
  eventCount: 42,
  totalCostUsd: 12.5,
  createdAt: "2026-01-15T00:00:00Z",
  lastEventAt: "2026-03-20T10:30:00Z",
  gitRemoteUrl: "git@github.com:org/repo.git",
  sourceControlSummary: [
    {
      provider: "gitlab",
      repositoryCount: 2,
      commitCount: 14,
      reviewCount: 3,
      pipelineCount: 5,
      lastActivityAt: "2026-03-20T10:30:00Z",
      lastSyncAt: "2026-03-20T11:00:00Z",
    },
  ],
  issueThroughputSummary: [
    {
      provider: "linear",
      issueCount: 8,
      completedCount: 3,
      stateChangeCount: 5,
      cycleCount: 2,
      lastActivityAt: "2026-03-20T10:30:00Z",
      lastSyncAt: "2026-03-20T11:00:00Z",
    },
  ],
};

const mockMembers = [
  { id: "1", userId: "user-1", email: "alice@example.com", name: "Alice Johnson", avatarUrl: null, role: "owner", joinedAt: "2024-01-01T00:00:00Z", totalEvents: 0, totalCost: 0, lastActiveAt: null },
  { id: "2", userId: "user-2", email: "bob@example.com", name: null, avatarUrl: null, role: "member", joinedAt: "2024-01-01T00:00:00Z", totalEvents: 0, totalCost: 0, lastActiveAt: null },
];

function setupDefaultMocks() {
  mockHasRole.mockReturnValue(false);
  mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
  mockUseEvents.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockUseEvent.mockReturnValue({ data: undefined, isLoading: false });
  mockUseDeleteProject.mockReturnValue({ mutateAsync: vi.fn() });
  mockUseProjectDailyByTool.mockReturnValue({ data: undefined, isLoading: false });
  mockUseProjectRepositories.mockReturnValue({ data: undefined, isLoading: false });
  mockUseProjectMembers.mockReturnValue({ data: mockMembers, isLoading: false });
  mockUseProjectStats.mockReturnValue({ data: { daily: [], totalEvents: 0, totalCost: 0 } });
  mockUseCurrentUser.mockReturnValue({ data: { id: "user-99", globalAdmin: false }, isLoading: false });
  mockUseEventsSummary.mockReturnValue({ data: undefined });
  mockUseExportEvents.mockReturnValue({ exportEvents: vi.fn().mockResolvedValue({}), isExporting: false });
}

describe("ProjectDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("shows loading skeleton while project is loading", () => {
    mockUseProject.mockReturnValue({ data: undefined, isLoading: true });
    render(<ProjectDetail />);

    expect(screen.queryByText("My Project")).not.toBeInTheDocument();
  });

  it("shows not found when project is null", () => {
    mockUseProject.mockReturnValue({ data: null, isLoading: false });
    render(<ProjectDetail />);

    expect(screen.getByText("Project not found")).toBeInTheDocument();
  });

  it("renders project name and description", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(screen.getByText("A test project")).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("Total Events")).toBeInTheDocument();
    expect(screen.getByText("Total Cost")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Last Activity")).toBeInTheDocument();
  });

  it("renders source control summary when available", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("Source Control Activity")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Pipelines")).toBeInTheDocument();
  });

  it("renders issue throughput summary when available", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("Issue Throughput")).toBeInTheDocument();
    expect(screen.getByText("State Changes")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("renders Team section on the overview", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("navigates to settings when Settings menu item is clicked", async () => {
    const user = userEvent.setup();
    render(<ProjectDetail />);

    await user.click(screen.getByRole("button", { name: /project actions/i }));
    await user.click(screen.getByText("Settings"));

    expect(mockNavigate).toHaveBeenCalledWith("/projects/proj-1/settings");
  });

  describe("Active badge", () => {
    it("shows Active badge for active project", () => {
      render(<ProjectDetail />);

      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("shows Inactive badge for inactive project", () => {
      mockUseProject.mockReturnValue({
        data: { ...mockProject, isActive: false },
        isLoading: false,
      });
      render(<ProjectDetail />);

      expect(screen.getByText("Inactive")).toBeInTheDocument();
    });
  });

  describe("Tab navigation", () => {
    it("renders Events tab trigger", () => {
      render(<ProjectDetail />);

      expect(screen.getByRole("tab", { name: "Events" })).toBeInTheDocument();
    });

    it("renders Members tab trigger when user is a project member", () => {
      // user-1 is in mockMembers with role "owner"
      mockUseCurrentUser.mockReturnValue({ data: { id: "user-1", globalAdmin: false }, isLoading: false });
      render(<ProjectDetail />);

      expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    });

    it("does not render Members tab for non-member org user", () => {
      // user-99 is not in mockMembers and hasRole returns false
      render(<ProjectDetail />);

      expect(screen.queryByRole("tab", { name: "Members" })).not.toBeInTheDocument();
    });

    it("does not render Integrations tab for project member role", () => {
      // user-2 is in mockMembers with role "member" (not owner), hasRole returns false
      mockUseCurrentUser.mockReturnValue({ data: { id: "user-2", globalAdmin: false }, isLoading: false });
      render(<ProjectDetail />);

      expect(screen.queryByRole("tab", { name: "Integrations" })).not.toBeInTheDocument();
    });

    it("renders Integrations tab for org owner", () => {
      mockHasRole.mockReturnValue(true);
      render(<ProjectDetail />);

      expect(screen.getByRole("tab", { name: "Integrations" })).toBeInTheDocument();
    });
  });

  describe("Git remote attribution warning", () => {
    it("shows warning and settings link when git remote is missing (camelCase empty)", () => {
      mockUseProject.mockReturnValue({
        data: { ...mockProject, gitRemoteUrl: null },
        isLoading: false,
      });
      render(<ProjectDetail />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/No git remote configured for CLI attribution/i)).toBeInTheDocument();
      const settingsLink = screen.getByRole("link", { name: /open project settings/i });
      expect(settingsLink).toHaveAttribute("href", "/projects/proj-1/settings");
    });
  });
});
