import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@/test/utils";
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
  useOverviewStats: (...args: unknown[]) => mockUseOverviewStats(...args),
  useActiveUsers: (...args: unknown[]) => mockUseActiveUsers(...args),
  useDailyStats: (...args: unknown[]) => mockUseDailyStats(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useProjects: (...args: unknown[]) => mockUseProjects(...args),
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
