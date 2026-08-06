import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { MemberProfileView } from "./MemberProfile";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

const mockUseMember = vi.fn();
const mockUseMemberStats = vi.fn();
const mockUseMemberHeatmap = vi.fn();
const mockUseMemberEvents = vi.fn();
const mockUseProject = vi.fn();
const mockUseEvents = vi.fn();
const mockUseEvent = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useMember: (...args: unknown[]) => mockUseMember(...args),
  useMemberStats: (...args: unknown[]) => mockUseMemberStats(...args),
  useMemberHeatmap: (...args: unknown[]) => mockUseMemberHeatmap(...args),
  useMemberEvents: (...args: unknown[]) => mockUseMemberEvents(...args),
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
}));

const mockMember = {
  id: "mem-1",
  user_id: "user-1",
  organization_id: "org-1",
  role: "member" as const,
  user: {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice Johnson",
    avatarUrl: null,
  },
  created_at: "2024-01-01T00:00:00Z",
};

const mockStats = {
  total_events: 10,
  total_cost: 1.5,
  events_today: 1,
  events_this_week: 3,
  events_this_month: 10,
  most_used_tool: "claude_code",
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
  id: "proj-1",
  name: "Frontend App",
};

function setupDefaultMocks() {
  mockUseMember.mockReturnValue({ data: mockMember, isLoading: false, isError: false, error: null });
  mockUseMemberStats.mockReturnValue({ data: mockStats });
  mockUseMemberHeatmap.mockReturnValue({ data: [] });
  mockUseMemberEvents.mockReturnValue({ data: emptyEventsResponse, isLoading: false });
  mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
  mockUseEvents.mockReturnValue({ data: emptyEventsResponse, isLoading: false });
  mockUseEvent.mockReturnValue({ data: null, isLoading: false });
}

describe("MemberProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe("org-switch 404 redirect (AIX-589)", () => {
    it("redirects to members list when useMember returns 404", async () => {
      mockUseMember.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError("Not found", 404, null),
      });
      render(<MemberProfileView memberId="stale-mem" />);
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/members", { replace: true });
      });
    });

    it("does not redirect on non-404 errors", async () => {
      mockUseMember.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError("Forbidden", 403, null),
      });
      render(<MemberProfileView memberId="mem-1" />);
      await Promise.resolve();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("does not redirect on 404 when embedded", async () => {
      mockUseMember.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError("Not found", 404, null),
      });
      render(<MemberProfileView memberId="stale-mem" embedded />);
      await Promise.resolve();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("without projectId", () => {
    it("renders member name", () => {
      render(<MemberProfileView memberId="mem-1" />);
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    });

    it("displays join date from camelCase createdAt field (API response format)", () => {
      mockUseMember.mockReturnValue({
        data: { ...mockMember, createdAt: "2024-03-15T12:00:00Z" },
        isLoading: false,
      });
      render(<MemberProfileView memberId="mem-1" />);
      expect(screen.getByText(/Joined Mar 15, 2024/)).toBeInTheDocument();
    });

    it("shows Unknown when createdAt is absent", () => {
      mockUseMember.mockReturnValue({
        data: { ...mockMember, createdAt: undefined },
        isLoading: false,
      });
      render(<MemberProfileView memberId="mem-1" />);
      expect(screen.getByText(/Joined Unknown/)).toBeInTheDocument();
    });

    it("does not render project commits section", () => {
      render(<MemberProfileView memberId="mem-1" />);
      expect(screen.queryByText(/Commits in/)).not.toBeInTheDocument();
    });

    it("links back to /members", () => {
      render(<MemberProfileView memberId="mem-1" />);

      const backLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/members");
      expect(backLinks.length).toBeGreaterThan(0);
    });
  });

  describe("time-range selector", () => {
    it("requests the 30-day range by default", () => {
      render(<MemberProfileView memberId="mem-1" />);
      expect(mockUseMemberStats).toHaveBeenLastCalledWith("org-1", "mem-1", "30d");
    });

    it("re-requests stats for the selected range when All time is clicked", async () => {
      const user = userEvent.setup();
      render(<MemberProfileView memberId="mem-1" />);
      await user.click(screen.getByRole("button", { name: "All time" }));
      expect(mockUseMemberStats).toHaveBeenLastCalledWith("org-1", "mem-1", "all");
    });
  });

  describe("with projectId", () => {
    it("renders the project commits section header", () => {
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText("Commits in Frontend App")).toBeInTheDocument();
    });

    it("shows project name from useProject in section header", () => {
      mockUseProject.mockReturnValue({ data: { id: "proj-2", name: "Backend API" }, isLoading: false });
      render(<MemberProfileView memberId="mem-1" projectId="proj-2" />);
      expect(screen.getByText("Commits in Backend API")).toBeInTheDocument();
    });

    it("shows fallback header when project name is not yet loaded", () => {
      mockUseProject.mockReturnValue({ data: null, isLoading: true });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText("Commits in Project")).toBeInTheDocument();
    });

    it("shows empty commits table without error when user has no commits", () => {
      mockUseEvents.mockReturnValue({ data: emptyEventsResponse, isLoading: false });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText("Commits in Frontend App")).toBeInTheDocument();
    });

    it("passes project_id and event_type to useEvents", () => {
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(mockUseEvents).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ project_id: "proj-1", event_type: "commit" }),
        expect.objectContaining({ enabled: true })
      );
    });

    it("does not enable the commits query when member user_id is not yet available", () => {
      mockUseMember.mockReturnValue({ data: null, isLoading: true });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(mockUseEvents).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ project_id: "proj-1" }),
        expect.objectContaining({ enabled: false })
      );
    });

    it("shows loading state while project commits are loading", () => {
      mockUseEvents.mockReturnValue({ data: undefined, isLoading: true });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText("Commits in Frontend App")).toBeInTheDocument();
    });

    it("renders commits section without error when useEvents returns undefined data", () => {
      mockUseEvents.mockReturnValue({ data: undefined, isLoading: false });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText("Commits in Frontend App")).toBeInTheDocument();
    });

    it("renders commits section without crashing when useEvents returns an error", () => {
      mockUseEvents.mockReturnValue({ data: undefined, isLoading: false, isError: true });
      render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
      expect(screen.getByText("Commits in Frontend App")).toBeInTheDocument();
    });

    describe("pagination", () => {
      it("does not show pagination controls when there is only one page", () => {
        mockUseEvents.mockReturnValue({
          data: { data: [], meta: { current_page: 1, total_pages: 1, total_count: 5, per_page: 20 } },
          isLoading: false,
        });
        render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
        expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
      });

      it("shows Previous and Next buttons when there are multiple pages", () => {
        mockUseEvents.mockReturnValue({
          data: { data: [], meta: { current_page: 1, total_pages: 3, total_count: 50, per_page: 20 } },
          isLoading: false,
        });
        render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
        expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
      });

      it("disables Previous on the first page", () => {
        mockUseEvents.mockReturnValue({
          data: { data: [], meta: { current_page: 1, total_pages: 3, total_count: 50, per_page: 20 } },
          isLoading: false,
        });
        render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
        expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
      });

      it("advances to page 2 when Next is clicked", async () => {
        const user = userEvent.setup();
        mockUseEvents.mockReturnValue({
          data: { data: [], meta: { current_page: 1, total_pages: 3, total_count: 50, per_page: 20 } },
          isLoading: false,
        });
        render(<MemberProfileView memberId="mem-1" projectId="proj-1" />);
        await user.click(screen.getByRole("button", { name: /next/i }));
        const lastCall = mockUseEvents.mock.calls[mockUseEvents.mock.calls.length - 1];
        expect(lastCall[1]).toMatchObject({ page: 2 });
      });
    });
  });
});
