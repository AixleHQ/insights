import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { OrgDashboard } from "./OrgDashboard";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

let mockCurrentOrg: { id: string; name: string; slug: string } | undefined = {
  id: "org-1",
  name: "Org One",
  slug: "org-one",
};

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: mockCurrentOrg,
    currentRole: "owner",
    isLoading: false,
    hasRole: () => true,
  }),
}));

const mockUseOverviewStats = vi.fn();
const mockUseActiveUsers = vi.fn();
const mockUseDailyStats = vi.fn();
const mockUseEvents = vi.fn();
const mockUseProjects = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  clientTimezone: "America/Montevideo",
  useOverviewStats: (...args: unknown[]) => mockUseOverviewStats(...args),
  useActiveUsers: (...args: unknown[]) => mockUseActiveUsers(...args),
  useDailyStats: (...args: unknown[]) => mockUseDailyStats(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useProjects: (...args: unknown[]) => mockUseProjects(...args),
  useEvent: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/components/dashboard", () => ({
  MetricCard: () => null,
  MetricGrid: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CostTrendChart: () => null,
  ActivityFeed: () => null,
  TopToolsChart: () => null,
  ToolInsightsSection: () => null,
  WeeklyToolUsageChart: () => null,
  RiskAlertsTable: () => null,
}));

vi.mock("@/components/events", () => ({
  EventDrawer: () => null,
}));

vi.mock("@/pages/MemberDashboard", () => ({
  MemberDashboard: () => null,
}));

function setupDefaultMocks() {
  mockUseOverviewStats.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  mockUseActiveUsers.mockReturnValue({ data: undefined });
  mockUseDailyStats.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  mockUseEvents.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() });
  mockUseProjects.mockReturnValue({ data: [{ id: "proj-1", name: "Project One" }] });
}

describe("OrgDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockCurrentOrg = { id: "org-1", name: "Org One", slug: "org-one" };
  });

  it("clears a project selected under the previous org when the current org changes", async () => {
    const user = userEvent.setup();
    const { rerender, getAllByRole, findByRole } = render(<OrgDashboard />);

    await user.click(getAllByRole("combobox")[0]);
    await user.click(await findByRole("option", { name: "Project One" }));

    expect(mockUseOverviewStats).toHaveBeenLastCalledWith("org-1", "proj-1", expect.anything());

    // AIX-530 regression: switching orgs must clear the stale project id,
    // or dashboard requests keep scoping to a project the new org can't see.
    mockCurrentOrg = { id: "org-2", name: "Org Two", slug: "org-two" };
    rerender(<OrgDashboard />);

    expect(mockUseOverviewStats).toHaveBeenLastCalledWith("org-2", undefined, expect.anything());
    expect(mockUseActiveUsers).toHaveBeenLastCalledWith("org-2", undefined, 7);
  });
});

// Helpers to read the project filter each hook last received.
const lastEventsProjectId = () => mockUseEvents.mock.calls.at(-1)?.[1]?.project_id;
const lastStatsProjectId = () => mockUseOverviewStats.mock.calls.at(-1)?.[1]; // useOverviewStats(orgId, projectId, period)

describe("OrgDashboard — Recent Activity filter (AIX-523)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentOrg = { id: "org-1", name: "Org One", slug: "org-one" };
    mockUseActiveUsers.mockReturnValue({ data: undefined });
    mockUseDailyStats.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
    mockUseEvents.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    mockUseOverviewStats.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
    mockUseProjects.mockReturnValue({ data: [{ id: "proj-1", name: "Aixle Insights" }] });
  });

  it("sends the current-month range + tz to useEvents and matches the stats card's project filter", () => {
    render(<OrgDashboard />);
    const params = mockUseEvents.mock.calls.at(-1)?.[1];
    expect(params).toMatchObject({ per_page: 10, tz: "America/Montevideo" });
    expect(params.start_date).toMatch(/^\d{4}-\d{2}-01$/);
    expect(params.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Parity: Recent Activity and the stats cards start from the same (absent) project filter.
    expect(lastEventsProjectId()).toBe(lastStatsProjectId()); // both undefined initially
  });

  it("keeps useEvents in lockstep with the stats card after selecting No Project", async () => {
    const user = userEvent.setup();
    render(<OrgDashboard />);
    // Radix's combobox role has no "name from content" per ARIA spec, so the trigger's
    // visible text isn't an accessible name — select by position instead. The project
    // filter renders before the period selector (OrgDashboard.tsx render order).
    const [projectFilterTrigger] = screen.getAllByRole("combobox");
    await user.click(projectFilterTrigger);
    await user.click(screen.getByRole("option", { name: /no project/i }));
    await waitFor(() => {
      expect(lastStatsProjectId()).toBe("none"); // stats card filtered (already worked)
      expect(lastEventsProjectId()).toBe("none"); // Recent Activity now filtered too (the fix)
    });
  });
});
