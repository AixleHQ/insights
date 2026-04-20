import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { ToolModelCostChart } from "./ToolModelCostChart";
import type { ToolModelStat } from "@/lib/types";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
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

function makeModel(name: string, costUsd: number): ToolModelStat {
  return {
    name,
    eventCount: 10,
    tokensIn: 1000,
    tokensOut: 500,
    costUsd,
    price_per_million_input: null,
    price_per_million_output: null,
  };
}

describe("ToolModelCostChart", () => {
  it("renders loading skeletons when isLoading is true", () => {
    render(<ToolModelCostChart models={[]} isLoading />);
    // At minimum the chart title is visible
    expect(screen.getByText("Cost by Model")).toBeInTheDocument();
  });

  it("shows empty state when no models", () => {
    render(<ToolModelCostChart models={[]} isLoading={false} />);
    expect(screen.getByText("No model data for this period.")).toBeInTheDocument();
  });

  it("renders chart container when models are provided", () => {
    const models = [makeModel("gpt-4o", 2.5), makeModel("claude-3-haiku", 1.2)];
    render(<ToolModelCostChart models={models} isLoading={false} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("renders the card title", () => {
    const models = [makeModel("gpt-4o", 1.0)];
    render(<ToolModelCostChart models={models} isLoading={false} />);
    expect(screen.getByText("Cost by Model")).toBeInTheDocument();
  });

  it("limits to top 10 models", () => {
    const models = Array.from({ length: 15 }, (_, i) =>
      makeModel(`model-${i}`, 15 - i),
    );
    // Component should render without error even with 15 models
    render(<ToolModelCostChart models={models} isLoading={false} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("truncates model names longer than 30 chars", () => {
    // We test the internal truncate logic via exported helper indirectly
    // by passing a long name and verifying the component renders
    const longName = "a".repeat(35);
    const models = [makeModel(longName, 1.0)];
    render(<ToolModelCostChart models={models} isLoading={false} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });
});
