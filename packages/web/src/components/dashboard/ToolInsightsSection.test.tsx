import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ToolInsightsSection } from "./ToolInsightsSection";
import type {
  ToolModelsResponse,
  ToolUsersResponse,
  ToolDailyResponse,
  ToolEventTypesResponse,
} from "@/lib/types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  AreaChart: () => <div data-testid="area-chart" />,
  BarChart: () => <div data-testid="bar-chart" />,
  Area: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("@/hooks/useApi", () => ({
  useActiveTools: vi.fn(),
  useToolModels: vi.fn(),
  useToolUsers: vi.fn(),
  useToolDaily: vi.fn(),
  useToolEventTypes: vi.fn(),
  useConnectors: vi.fn(),
  useConnectorSyncStatus: vi.fn(),
  useSyncConnector: vi.fn(),
}));

import {
  useActiveTools,
  useToolModels,
  useToolUsers,
  useToolDaily,
  useToolEventTypes,
  useConnectors,
  useConnectorSyncStatus,
  useSyncConnector,
} from "@/hooks/useApi";

const mockUseActiveTools = vi.mocked(useActiveTools);
const mockUseToolModels = vi.mocked(useToolModels);
const mockUseToolUsers = vi.mocked(useToolUsers);
const mockUseToolDaily = vi.mocked(useToolDaily);
const mockUseToolEventTypes = vi.mocked(useToolEventTypes);
const mockUseConnectors = vi.mocked(useConnectors);
const mockUseConnectorSyncStatus = vi.mocked(useConnectorSyncStatus);
const mockUseSyncConnector = vi.mocked(useSyncConnector);

function makeActiveTools(tools: Array<{ tool_name: string; total_events: number }>) {
  return {
    data: {
      tools: tools.map((t) => ({ ...t, total_cost_usd: 1.5, active_users: 3 })),
    },
    isLoading: false,
  };
}

const emptyModels: { data: ToolModelsResponse; isLoading: false } = {
  data: { tool: "cursor", timeRange: { start: "", end: "" }, models: [] },
  isLoading: false,
};

const emptyUsers: { data: ToolUsersResponse; isLoading: false } = {
  data: { tool: "cursor", timeRange: { start: "", end: "" }, users: [] },
  isLoading: false,
};

const emptyDaily: { data: ToolDailyResponse; isLoading: false } = {
  data: {
    tool: "cursor",
    timeRange: { start: "", end: "" },
    daily: [
      { date: "2026-04-01", eventCount: 5, tokensIn: 1000, tokensOut: 500, costUsd: 0.01 },
    ],
  },
  isLoading: false,
};

const emptyEventTypes: { data: ToolEventTypesResponse; isLoading: false } = {
  data: { tool: "cursor", timeRange: { start: "", end: "" }, eventTypes: [] },
  isLoading: false,
};

const noConnectors = { data: [], isLoading: false };
const noSyncStatus = { data: undefined, isLoading: false };

function makeNoMutate() {
  return { mutate: vi.fn(), isPending: false };
}

function setupDefaults() {
  mockUseToolModels.mockReturnValue(emptyModels as never);
  mockUseToolUsers.mockReturnValue(emptyUsers as never);
  mockUseToolDaily.mockReturnValue(emptyDaily as never);
  mockUseToolEventTypes.mockReturnValue(emptyEventTypes as never);
  mockUseConnectors.mockReturnValue(noConnectors as never);
  mockUseConnectorSyncStatus.mockReturnValue(noSyncStatus as never);
  mockUseSyncConnector.mockReturnValue(makeNoMutate() as never);
}

describe("ToolInsightsSection", () => {
  const defaultProps = {
    orgId: "org-123",
    days: 30,
    onDaysChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while active tools are loading", () => {
    mockUseActiveTools.mockReturnValue({ data: undefined, isLoading: true } as never);
    setupDefaults();
    const { container } = render(<ToolInsightsSection {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no tools have events", () => {
    mockUseActiveTools.mockReturnValue(makeActiveTools([]) as never);
    setupDefaults();
    const { container } = render(<ToolInsightsSection {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders section when at least one tool has events", () => {
    mockUseActiveTools.mockReturnValue(makeActiveTools([{ tool_name: "cursor", total_events: 42 }]) as never);
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByText("Tool Insights")).toBeInTheDocument();
  });

  it("shows Claude Code tab when claude_code has events", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "claude_code", total_events: 100 }]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Claude Code" })).toBeInTheDocument();
  });

  it("shows multiple tabs ordered by event count from backend", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([
        { tool_name: "claude_code", total_events: 200 },
        { tool_name: "cursor", total_events: 150 },
        { tool_name: "openrouter_api", total_events: 50 },
      ]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Claude Code" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cursor" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "OpenRouter" })).toBeInTheDocument();
  });

  it("does not show tabs for tools without events", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "cursor", total_events: 42 }]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Cursor" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Claude Code" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("renders day range buttons (7d, 30d, 90d, 1y)", () => {
    mockUseActiveTools.mockReturnValue(makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never);
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1y" })).toBeInTheDocument();
  });

  it("calls onDaysChange when day button is clicked", () => {
    const onDaysChange = vi.fn();
    mockUseActiveTools.mockReturnValue(makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never);
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} onDaysChange={onDaysChange} />);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(onDaysChange).toHaveBeenCalledWith(7);
  });

  it("shows empty state when daily data has no events for active tab", () => {
    mockUseActiveTools.mockReturnValue(makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never);
    setupDefaults();
    mockUseToolDaily.mockReturnValue({
      data: { tool: "cursor", timeRange: { start: "", end: "" }, daily: [] },
      isLoading: false,
    } as never);
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByText(/No Cursor events in the last 30 days/i)).toBeInTheDocument();
  });

  it("shows sync status subsection when active connector exists for tool", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "openrouter_api", total_events: 10 }]) as never
    );
    setupDefaults();
    mockUseToolDaily.mockReturnValue({
      data: {
        tool: "openrouter_api",
        timeRange: { start: "", end: "" },
        daily: [{ date: "2026-04-01", eventCount: 3, tokensIn: 100, tokensOut: 50, costUsd: 0.05 }],
      },
      isLoading: false,
    } as never);
    mockUseConnectors.mockReturnValue({
      data: [{ id: "conn-1", connectorType: "openrouter", isActive: true, status: "connected" }],
      isLoading: false,
    } as never);
    mockUseConnectorSyncStatus.mockReturnValue({
      data: { connector_type: "openrouter", status: "connected", last_sync_at: null, last_error: null, total_events: 10 },
      isLoading: false,
    } as never);

    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByText("Data Sync")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync Now/i })).toBeInTheDocument();
  });

  it("does not show sync status for tools without a connector (e.g. claude_code)", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "claude_code", total_events: 100 }]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.queryByText("Data Sync")).not.toBeInTheDocument();
  });

  it("shows active users count from users response", () => {
    mockUseActiveTools.mockReturnValue(makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never);
    setupDefaults();
    mockUseToolUsers.mockReturnValue({
      data: {
        tool: "cursor",
        timeRange: { start: "", end: "" },
        users: [
          { userId: "u1", name: "Alice", email: "a@a.com", eventCount: 10, totalTokens: 1000, costUsd: 0.1 },
          { userId: "u2", name: "Bob", email: "b@b.com", eventCount: 5, totalTokens: 500, costUsd: 0.05 },
        ],
      },
      isLoading: false,
    } as never);
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("fetches active users for the selected date range, not a fixed window", () => {
    mockUseActiveTools.mockReturnValue(makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never);
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} days={365} />);
    expect(mockUseToolUsers).toHaveBeenCalledWith("org-123", "cursor", 365, undefined);
  });

  it("handles unknown tool names with auto-formatted label", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "some_new_tool", total_events: 5 }]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Some New Tool" })).toBeInTheDocument();
  });

  it("passes projectId to the per-tab data hooks but not to useActiveTools", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} projectId="proj-9" />);

    expect(mockUseActiveTools).toHaveBeenCalledWith("org-123");
    expect(mockUseToolDaily).toHaveBeenCalledWith("org-123", "cursor", 30, "day", "proj-9");
    expect(mockUseToolModels).toHaveBeenCalledWith("org-123", "cursor", 30, "proj-9");
    expect(mockUseToolUsers).toHaveBeenCalledWith("org-123", "cursor", 30, "proj-9");
  });

  it("passes undefined projectId to the per-tab hooks when no project is selected", () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "cursor", total_events: 5 }]) as never
    );
    setupDefaults();
    render(<ToolInsightsSection {...defaultProps} />);

    expect(mockUseActiveTools).toHaveBeenCalledWith("org-123");
    expect(mockUseToolDaily).toHaveBeenCalledWith("org-123", "cursor", 30, "day", undefined);
  });

  it("still invalidates stats queries and shows an error toast when connector sync fails", async () => {
    mockUseActiveTools.mockReturnValue(
      makeActiveTools([{ tool_name: "openrouter_api", total_events: 10 }]) as never
    );
    setupDefaults();
    mockUseConnectors.mockReturnValue({
      data: [{ id: "conn-1", connectorType: "openrouter", isActive: true, status: "connected" }],
      isLoading: false,
    } as never);
    const mockSyncConnector = vi.fn().mockRejectedValue(new Error("sync failed"));
    mockUseSyncConnector.mockReturnValue({ mutateAsync: mockSyncConnector, isPending: false } as never);

    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    render(<ToolInsightsSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Refresh Now/i }));

    await waitFor(() => expect(mockSyncConnector).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["organizations", "org-123", "stats", "tools", "openrouter_api"],
        })
      )
    );
    expect(toast.error).toHaveBeenCalled();
  });
});
