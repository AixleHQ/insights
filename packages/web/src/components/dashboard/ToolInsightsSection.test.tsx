import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { ToolInsightsSection } from "./ToolInsightsSection";
import type {
  ToolOverviewStats,
  ToolModelsResponse,
  ToolUsersResponse,
  ToolDailyResponse,
  ToolEventTypesResponse,
} from "@/lib/types";

// Mock recharts to avoid jsdom SVG rendering issues
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  AreaChart: () => <div data-testid="area-chart" />,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

// Mock the ChartContainer / Tooltip from shadcn/ui chart to be a simple passthrough
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("@/hooks/useApi", () => ({
  useToolOverview: vi.fn(),
  useToolModels: vi.fn(),
  useToolUsers: vi.fn(),
  useToolDaily: vi.fn(),
  useToolEventTypes: vi.fn(),
}));

import {
  useToolOverview,
  useToolModels,
  useToolUsers,
  useToolDaily,
  useToolEventTypes,
} from "@/hooks/useApi";

const mockUseToolOverview = vi.mocked(useToolOverview);
const mockUseToolModels = vi.mocked(useToolModels);
const mockUseToolUsers = vi.mocked(useToolUsers);
const mockUseToolDaily = vi.mocked(useToolDaily);
const mockUseToolEventTypes = vi.mocked(useToolEventTypes);

function makeOverview(total_events: number): { data: ToolOverviewStats; isLoading: false } {
  return {
    data: {
      tool: "cursor",
      total_events,
      total_cost_usd: 1.5,
      total_tokens_in: 50000,
      total_tokens_out: 15000,
      active_users: 3,
      events_change_pct: 5,
      cost_change_pct: 2,
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

function setupLoadingState() {
  mockUseToolOverview.mockReturnValue({ data: undefined, isLoading: true } as never);
  mockUseToolModels.mockReturnValue({ data: undefined, isLoading: true } as never);
  mockUseToolUsers.mockReturnValue({ data: undefined, isLoading: true } as never);
  mockUseToolDaily.mockReturnValue({ data: undefined, isLoading: true } as never);
  mockUseToolEventTypes.mockReturnValue({ data: undefined, isLoading: true } as never);
}

function setupCursorOnlyData() {
  mockUseToolOverview.mockImplementation((_, tool) => {
    if (tool === "cursor") return makeOverview(42) as never;
    return makeOverview(0) as never;
  });
  mockUseToolModels.mockReturnValue(emptyModels as never);
  mockUseToolUsers.mockReturnValue(emptyUsers as never);
  mockUseToolDaily.mockReturnValue(emptyDaily as never);
  mockUseToolEventTypes.mockReturnValue(emptyEventTypes as never);
}

function setupNoData() {
  mockUseToolOverview.mockReturnValue(makeOverview(0) as never);
  mockUseToolModels.mockReturnValue(emptyModels as never);
  mockUseToolUsers.mockReturnValue(emptyUsers as never);
  mockUseToolDaily.mockReturnValue(emptyDaily as never);
  mockUseToolEventTypes.mockReturnValue(emptyEventTypes as never);
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

  it("renders nothing while both tool overviews are still loading", () => {
    setupLoadingState();
    const { container } = render(<ToolInsightsSection {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when both tools have zero events", () => {
    setupNoData();
    const { container } = render(<ToolInsightsSection {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the section when cursor has events", () => {
    setupCursorOnlyData();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByText("Tool Insights")).toBeInTheDocument();
  });

  it("shows Cursor tab when cursor has events", () => {
    setupCursorOnlyData();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Cursor" })).toBeInTheDocument();
  });

  it("does not show OpenRouter tab when openrouter_api has no events", () => {
    setupCursorOnlyData();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.queryByRole("tab", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("shows both tabs when both tools have events", () => {
    mockUseToolOverview.mockReturnValue(makeOverview(10) as never);
    mockUseToolModels.mockReturnValue(emptyModels as never);
    mockUseToolUsers.mockReturnValue(emptyUsers as never);
    mockUseToolDaily.mockReturnValue(emptyDaily as never);
    mockUseToolEventTypes.mockReturnValue(emptyEventTypes as never);

    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Cursor" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "OpenRouter" })).toBeInTheDocument();
  });

  it("renders day range buttons (7d, 30d, 90d)", () => {
    setupCursorOnlyData();
    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90d" })).toBeInTheDocument();
  });

  it("calls onDaysChange with 7 when the 7d button is clicked", () => {
    const onDaysChange = vi.fn();
    setupCursorOnlyData();
    render(<ToolInsightsSection {...defaultProps} onDaysChange={onDaysChange} />);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(onDaysChange).toHaveBeenCalledWith(7);
  });

  it("calls onDaysChange with 90 when the 90d button is clicked", () => {
    const onDaysChange = vi.fn();
    setupCursorOnlyData();
    render(<ToolInsightsSection {...defaultProps} onDaysChange={onDaysChange} />);
    fireEvent.click(screen.getByRole("button", { name: "90d" }));
    expect(onDaysChange).toHaveBeenCalledWith(90);
  });

  it("shows active users count derived from users response", () => {
    mockUseToolOverview.mockImplementation((_, tool) => {
      if (tool === "cursor") return makeOverview(5) as never;
      return makeOverview(0) as never;
    });
    mockUseToolModels.mockReturnValue(emptyModels as never);
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
    mockUseToolDaily.mockReturnValue(emptyDaily as never);
    mockUseToolEventTypes.mockReturnValue(emptyEventTypes as never);

    render(<ToolInsightsSection {...defaultProps} />);
    // Active Users card should show 2
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows empty state inside Cursor tab when daily data has no events", () => {
    mockUseToolOverview.mockImplementation((_, tool) => {
      if (tool === "cursor") return makeOverview(5) as never;
      return makeOverview(0) as never;
    });
    mockUseToolModels.mockReturnValue(emptyModels as never);
    mockUseToolUsers.mockReturnValue(emptyUsers as never);
    mockUseToolDaily.mockReturnValue({
      data: { tool: "cursor", timeRange: { start: "", end: "" }, daily: [] },
      isLoading: false,
    } as never);
    mockUseToolEventTypes.mockReturnValue(emptyEventTypes as never);

    render(<ToolInsightsSection {...defaultProps} />);
    expect(screen.getByText(/No Cursor events in the last 30 days/i)).toBeInTheDocument();
  });
});
