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
});
