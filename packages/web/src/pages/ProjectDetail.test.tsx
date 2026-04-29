import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectDetail } from "./ProjectDetail";

const mockNavigate = vi.fn();

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
    isLoading: false,
  }),
}));

const mockUseProject = vi.fn();
const mockUseEvents = vi.fn();
const mockUseEvent = vi.fn();
const mockUseDeleteProject = vi.fn();
const mockUseProjectDailyByTool = vi.fn();
const mockUseProjectRepositories = vi.fn();
const mockUseProjectMembers = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
  useDeleteProject: () => mockUseDeleteProject(),
  useProjectDailyByTool: (...args: unknown[]) => mockUseProjectDailyByTool(...args),
  useProjectRepositories: (...args: unknown[]) => mockUseProjectRepositories(...args),
  useProjectMembers: (...args: unknown[]) => mockUseProjectMembers(...args),
  useConnectors: () => ({ data: [] }),
  useAvailableRepos: () => ({ data: [], isLoading: false }),
  useConnectRepo: () => ({ mutateAsync: vi.fn() }),
  useDisconnectRepo: () => ({ mutateAsync: vi.fn() }),
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
};

const mockMembers = [
  { id: "1", userId: "user-1", email: "alice@example.com", name: "Alice Johnson", avatarUrl: null, role: "owner", joinedAt: "2024-01-01T00:00:00Z" },
  { id: "2", userId: "user-2", email: "bob@example.com", name: null, avatarUrl: null, role: "member", joinedAt: "2024-01-01T00:00:00Z" },
];

const mockEvent = {
  id: "evt-1",
  eventType: "prompt",
  occurredAt: "2026-03-20T10:30:00Z",
  createdAt: "2026-03-20T10:30:00Z",
  toolName: "claude_code",
  riskLevel: "low",
  costUsd: 0.01,
  inputTokens: 100,
  outputTokens: 200,
  model: "claude-3",
  sanitizedContent: null,
  securityFindings: [],
  user: { id: "user-1", email: "alice@example.com", name: "Alice Johnson" },
  project: { id: "proj-1", name: "My Project" },
};

function setupDefaultMocks() {
  mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
  mockUseEvents.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockUseEvent.mockReturnValue({ data: undefined, isLoading: false });
  mockUseDeleteProject.mockReturnValue({ mutateAsync: vi.fn() });
  mockUseProjectDailyByTool.mockReturnValue({ data: undefined, isLoading: false });
  mockUseProjectRepositories.mockReturnValue({ data: undefined, isLoading: false });
  mockUseProjectMembers.mockReturnValue({ data: mockMembers, isLoading: false });
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

  it("renders Recent Events section", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("Recent Events")).toBeInTheDocument();
  });

  it("renders source control summary when available", () => {
    render(<ProjectDetail />);

    expect(screen.getByText("Source Control Activity")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not render Team section on the overview", () => {
    render(<ProjectDetail />);

    expect(screen.queryByText("Team")).not.toBeInTheDocument();
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

  describe("User filter", () => {
    it("renders member filter dropdown when project has members", () => {
      render(<ProjectDetail />);
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("does not render filter dropdown when project has no members", () => {
      mockUseProjectMembers.mockReturnValue({ data: [], isLoading: false });
      render(<ProjectDetail />);
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("does not render filter dropdown when members are undefined", () => {
      mockUseProjectMembers.mockReturnValue({ data: undefined, isLoading: false });
      render(<ProjectDetail />);
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("passes user_id to useEvents when a member is selected", async () => {
      const user = userEvent.setup();
      render(<ProjectDetail />);

      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByText("Alice Johnson"));

      const lastCall = mockUseEvents.mock.calls[mockUseEvents.mock.calls.length - 1];
      expect(lastCall[1]).toMatchObject({ user_id: "user-1" });
    });

    it("falls back to email prefix for members without a name", async () => {
      const user = userEvent.setup();
      render(<ProjectDetail />);

      await user.click(screen.getByRole("combobox"));
      expect(await screen.findByText("bob")).toBeInTheDocument();
    });

    it("shows empty events without error when filtered user has no events", () => {
      mockUseEvents.mockReturnValue({
        data: { data: [], meta: { current_page: 1, total_pages: 0, total_count: 0, per_page: 10 } },
        isLoading: false,
      });
      render(<ProjectDetail />);
      expect(screen.getByText("Recent Events")).toBeInTheDocument();
    });

    it("renders events section while events are loading", () => {
      mockUseEvents.mockReturnValue({ data: undefined, isLoading: true });
      render(<ProjectDetail />);
      expect(screen.getByText("Recent Events")).toBeInTheDocument();
    });

    it("renders events section when events return undefined data", () => {
      mockUseEvents.mockReturnValue({ data: undefined, isLoading: false });
      render(<ProjectDetail />);
      expect(screen.getByText("Recent Events")).toBeInTheDocument();
    });

    it("shows an error alert when useEvents fails", () => {
      mockUseEvents.mockReturnValue({ data: undefined, isLoading: false, isError: true });
      render(<ProjectDetail />);
      expect(screen.getByText("Failed to load events. Please try again.")).toBeInTheDocument();
    });

    it("preserves selected user filter when event drawer is opened and closed", async () => {
      const user = userEvent.setup();
      mockUseEvents.mockReturnValue({
        data: { data: [mockEvent], meta: { current_page: 1, total_pages: 1, total_count: 1, per_page: 10 } },
        isLoading: false,
      });

      render(<ProjectDetail />);

      // Select a member filter
      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByText("Alice Johnson"));

      // Open the drawer by clicking the event row
      const rows = screen.getAllByRole("row");
      const eventRow = rows.find((r) => r.getAttribute("class")?.includes("cursor-pointer"));
      expect(eventRow).toBeDefined();
      await user.click(eventRow!);

      // Close the drawer with Escape
      await user.keyboard("{Escape}");

      // Filter is still active after drawer close
      const callsAfterClose = mockUseEvents.mock.calls.filter(
        (call) => call[1]?.user_id === "user-1"
      );
      expect(callsAfterClose.length).toBeGreaterThan(0);
    });
  });
});
