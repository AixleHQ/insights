import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import { MemberDashboard } from "./MemberDashboard";

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Org One", slug: "org-one" },
  }),
}));

const mockUseCurrentUser = vi.fn();
const mockUseMemberDashboardStats = vi.fn();
const mockUseMemberHeatmap = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
  useMemberDashboardStats: (...args: unknown[]) => mockUseMemberDashboardStats(...args),
  useMemberHeatmap: (...args: unknown[]) => mockUseMemberHeatmap(...args),
}));

vi.mock("@/components/dashboard", () => ({
  MetricCard: () => null,
  MetricGrid: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TopToolsChart: () => <div data-testid="top-tools-chart" />,
  ActivityHeatmap: () => null,
  PromptInsightsSection: () => <div data-testid="prompt-insights-section">Prompt Insights</div>,
  ProjectFilterDropdown: () => <div data-testid="project-filter-dropdown" />,
  MemberPeriodSelect: () => <div data-testid="member-period-select" />,
  MEMBER_PERIOD_LABELS: { "7d": "7 days", "30d": "30 days", "90d": "90 days" },
}));

function setupDefaultMocks() {
  mockUseCurrentUser.mockReturnValue({ data: { id: "user-1" }, isLoading: false });
  mockUseMemberDashboardStats.mockReturnValue({ data: undefined, isLoading: false });
  mockUseMemberHeatmap.mockReturnValue({ data: undefined });
}

describe("MemberDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("does not render the Prompt Insights card (AIX-572: backend score is a stub)", () => {
    render(<MemberDashboard />);
    expect(screen.queryByTestId("prompt-insights-section")).not.toBeInTheDocument();
  });

  it("still renders TopToolsChart so it can fill the row", () => {
    render(<MemberDashboard />);
    expect(screen.getByTestId("top-tools-chart")).toBeInTheDocument();
  });

  it("shows project and period filters in the standalone header (AIX-607)", () => {
    render(<MemberDashboard />);
    expect(screen.getByTestId("project-filter-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("member-period-select")).toBeInTheDocument();
  });

  it("hides filter chrome when embedded via hideHeader", () => {
    render(<MemberDashboard hideHeader period="30d" projectId={undefined} />);
    expect(screen.queryByTestId("project-filter-dropdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-period-select")).not.toBeInTheDocument();
  });
});
