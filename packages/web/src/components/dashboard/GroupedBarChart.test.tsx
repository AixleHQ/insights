import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { GroupedBarChart, type GroupedBarSeries } from "./GroupedBarChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Legend: () => <div data-testid="legend" />,
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

const SERIES: GroupedBarSeries[] = [
  { key: "claude_code", label: "Claude Code", color: "#6366f1" },
  { key: "cursor", label: "Cursor", color: "#f59e0b" },
];

const DATA = [
  { claude_code: 10, cursor: 5 },
  { claude_code: 8, cursor: 12 },
];

const GROUPS = ["Mon", "Tue"];

describe("GroupedBarChart", () => {
  it("shows skeleton when loading", () => {
    render(<GroupedBarChart data={[]} groups={[]} series={SERIES} isLoading />);
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    // ChartSkeleton renders a div with role="status" or class from Skeleton
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
  });

  it("shows error state when isError", () => {
    render(
      <GroupedBarChart
        data={[]}
        groups={[]}
        series={SERIES}
        isError
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/could not load chart/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls onRetry when Try again clicked", async () => {
    const onRetry = vi.fn();
    render(
      <GroupedBarChart data={[]} groups={[]} series={SERIES} isError onRetry={onRetry} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders chart container when data provided", () => {
    render(<GroupedBarChart data={DATA} groups={GROUPS} series={SERIES} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("renders one Bar per series", () => {
    render(<GroupedBarChart data={DATA} groups={GROUPS} series={SERIES} />);
    expect(screen.getByTestId("bar-claude_code")).toBeInTheDocument();
    expect(screen.getByTestId("bar-cursor")).toBeInTheDocument();
  });

  it("renders legend element", () => {
    render(<GroupedBarChart data={DATA} groups={GROUPS} series={SERIES} />);
    expect(screen.getByTestId("legend")).toBeInTheDocument();
  });

  it("renders title and description when provided", () => {
    render(
      <GroupedBarChart
        data={DATA}
        groups={GROUPS}
        series={SERIES}
        title="Usage by Tool"
        description="42 events"
      />,
    );
    expect(screen.getByText("Usage by Tool")).toBeInTheDocument();
    expect(screen.getByText("42 events")).toBeInTheDocument();
  });

  it("renders without title when not provided", () => {
    render(<GroupedBarChart data={DATA} groups={GROUPS} series={SERIES} />);
    expect(screen.queryByText("Usage by Tool")).not.toBeInTheDocument();
  });

  it("renders without crash when series is empty", () => {
    render(<GroupedBarChart data={[]} groups={[]} series={[]} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("shows empty-data message when data is empty and not loading/error", () => {
    render(<GroupedBarChart data={[]} groups={[]} series={SERIES} />);
    expect(screen.getByText(/no data for this period/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });
});
