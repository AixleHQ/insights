import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { OrgDashboard } from "./OrgDashboard";

let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
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

vi.mock("@/components/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/dashboard")>();
  return {
    // Keep the real filter controls — the deep-link tests drive their comboboxes.
    ProjectFilterDropdown: actual.ProjectFilterDropdown,
    MemberPeriodSelect: actual.MemberPeriodSelect,
    MetricCard: () => null,
    MetricGrid: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    CostTrendChart: () => null,
    ActivityFeed: (props: { viewAllTo?: string }) => (
      <a data-testid="activity-view-all" href={props.viewAllTo}>
        View all
      </a>
    ),
    TopToolsChart: () => null,
    ToolInsightsSection: () => null,
    WeeklyToolUsageChart: () => null,
    RiskAlertsTable: () => null,
  };
});

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
    mockSearchParams = new URLSearchParams();
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

describe("OrgDashboard — filter chrome parity Team ↔ Personal (AIX-607)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockCurrentOrg = { id: "org-1", name: "Org One", slug: "org-one" };
    setupDefaultMocks();
    mockUseProjects.mockReturnValue({ data: [{ id: "proj-1", name: "Aixle Insights" }] });
  });

  it("labels the Team project dropdown All Projects", async () => {
    const user = userEvent.setup();
    render(<OrgDashboard />);

    const [projectFilterTrigger] = screen.getAllByRole("combobox");
    expect(projectFilterTrigger).toHaveTextContent("All Projects");

    await user.click(projectFilterTrigger);
    expect(screen.getByRole("option", { name: "All Projects" })).toBeInTheDocument();
  });

  it("labels the Personal project dropdown All Projects with matching control order", async () => {
    mockSearchParams = new URLSearchParams("tab=personal");
    const user = userEvent.setup();
    render(<OrgDashboard />);

    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(2);

    const [projectFilterTrigger, periodTrigger] = comboboxes;
    expect(projectFilterTrigger).toHaveTextContent("All Projects");
    expect(periodTrigger).toHaveTextContent("30 days");

    await user.click(projectFilterTrigger);
    expect(screen.getByRole("option", { name: "All Projects" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No Project" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Aixle Insights" })).toBeInTheDocument();
  });

  it("keeps project → period → tabs in the same header row on both tabs", () => {
    const { rerender } = render(<OrgDashboard />);

    const teamHeader = screen.getByRole("heading", { name: "Dashboard" }).closest("div")!.parentElement!;
    const teamComboboxes = within(teamHeader).getAllByRole("combobox");
    expect(teamComboboxes).toHaveLength(2);
    expect(within(teamHeader).getByRole("tablist")).toBeInTheDocument();
    expect(within(teamHeader).getByRole("tab", { name: "Team" })).toBeInTheDocument();
    expect(within(teamHeader).getByRole("tab", { name: "Personal" })).toBeInTheDocument();

    mockSearchParams = new URLSearchParams("tab=personal");
    rerender(<OrgDashboard />);

    const personalHeader = screen.getByRole("heading", { name: "Dashboard" }).closest("div")!.parentElement!;
    const personalComboboxes = within(personalHeader).getAllByRole("combobox");
    expect(personalComboboxes).toHaveLength(2);
    expect(within(personalHeader).getByRole("tablist")).toBeInTheDocument();
    // Project trigger still precedes period (same DOM order as Team).
    expect(personalComboboxes[0]).toHaveTextContent("All Projects");
    expect(personalComboboxes[1]).toHaveTextContent(/days/);
  });
});

describe("OrgDashboard — Recent Activity filter (AIX-523)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
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

describe("OrgDashboard — Recent Activity 'View all' deep-link (AIX-565)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockCurrentOrg = { id: "org-1", name: "Org One", slug: "org-one" };
    setupDefaultMocks();
    mockUseProjects.mockReturnValue({ data: [{ id: "proj-1", name: "Aixle Insights" }] });
    // Selecting a project must not fall into the "no data for project" empty
    // state (OrgDashboard.tsx), which would unmount ActivityFeed entirely.
    mockUseOverviewStats.mockReturnValue({ data: { total_events: 5 }, isLoading: false, isError: false, refetch: vi.fn() });
  });

  it("includes the current month's date range but no project_id when no project is selected", () => {
    render(<OrgDashboard />);
    const href = screen.getByTestId("activity-view-all").getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/events?")).toBe(true);
    expect(params.get("project_id")).toBeNull();
    expect(params.get("date_from")).toMatch(/^\d{4}-\d{2}-01$/);
    expect(params.get("date_to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries project_id=none through to the View all link after selecting No Project", async () => {
    const user = userEvent.setup();
    render(<OrgDashboard />);
    const [projectFilterTrigger] = screen.getAllByRole("combobox");
    await user.click(projectFilterTrigger);
    await user.click(screen.getByRole("option", { name: /no project/i }));

    await waitFor(() => {
      const href = screen.getByTestId("activity-view-all").getAttribute("href")!;
      const params = new URLSearchParams(href.split("?")[1]);
      expect(params.get("project_id")).toBe("none");
    });
  });

  it("carries the selected project's UUID through to the View all link", async () => {
    const user = userEvent.setup();
    render(<OrgDashboard />);
    const [projectFilterTrigger] = screen.getAllByRole("combobox");
    await user.click(projectFilterTrigger);
    await user.click(screen.getByRole("option", { name: "Aixle Insights" }));

    await waitFor(() => {
      const href = screen.getByTestId("activity-view-all").getAttribute("href")!;
      const params = new URLSearchParams(href.split("?")[1]);
      expect(params.get("project_id")).toBe("proj-1");
    });
  });

  it("omits date_from/date_to when All time is selected", async () => {
    const user = userEvent.setup();
    render(<OrgDashboard />);
    const [, periodTrigger] = screen.getAllByRole("combobox");
    await user.click(periodTrigger);
    await user.click(screen.getByRole("option", { name: "All time" }));

    await waitFor(() => {
      const href = screen.getByTestId("activity-view-all").getAttribute("href")!;
      const params = new URLSearchParams(href.split("?")[1]);
      expect(params.get("date_from")).toBeNull();
      expect(params.get("date_to")).toBeNull();
    });
  });
});
