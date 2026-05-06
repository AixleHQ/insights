import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { ToolModelTable } from "./ToolModelTable";
import type { ToolModelStat } from "@/lib/types";

const mockModels: ToolModelStat[] = [
  {
    name: "openai/gpt-4o",
    provider: "openai",
    model: "gpt-4o",
    displayName: "openai/gpt-4o",
    eventCount: 200,
    tokensIn: 80000,
    tokensOut: 20000,
    costUsd: 2.4,
    price_per_million_input: 5.0,
    price_per_million_output: 15.0,
  },
  {
    name: "openai/gpt-3.5-turbo",
    provider: "openai",
    model: "gpt-3.5-turbo",
    displayName: "openai/gpt-3.5-turbo",
    eventCount: 500,
    tokensIn: 150000,
    tokensOut: 50000,
    costUsd: 0.3,
    price_per_million_input: 0.5,
    price_per_million_output: 1.5,
  },
  {
    name: "anthropic/claude-3-haiku",
    provider: "anthropic",
    model: "claude-3-haiku",
    displayName: "anthropic/claude-3-haiku",
    eventCount: 100,
    tokensIn: 30000,
    tokensOut: 10000,
    costUsd: 0.08,
    price_per_million_input: null,
    price_per_million_output: null,
  },
];

describe("ToolModelTable", () => {
  it("shows skeleton rows while loading", () => {
    render(<ToolModelTable models={[]} isLoading={true} />);
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.queryByText("No model data")).not.toBeInTheDocument();
  });

  it("shows empty state when no models", () => {
    render(<ToolModelTable models={[]} isLoading={false} />);
    expect(screen.getByText("No model data for this period.")).toBeInTheDocument();
  });

  it("renders model names", () => {
    render(<ToolModelTable models={mockModels} isLoading={false} />);
    expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-3.5-turbo")).toBeInTheDocument();
    expect(screen.getByText("anthropic/claude-3-haiku")).toBeInTheDocument();
  });

  it("shows — for null pricing columns", () => {
    render(<ToolModelTable models={mockModels} isLoading={false} />);
    // claude-3-haiku has null pricing — both input and output show —
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("shows numeric $/M values when pricing is available", () => {
    render(<ToolModelTable models={mockModels} isLoading={false} />);
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
  });

  it("defaults to sorting by cost descending (highest cost first)", () => {
    render(<ToolModelTable models={mockModels} isLoading={false} />);
    const rows = screen.getAllByRole("row");
    // First data row (index 1, after header) should be openai/gpt-4o (costUsd 2.4)
    expect(rows[1]).toHaveTextContent("openai/gpt-4o");
  });

  it("toggles sort to ascending when same sort column is clicked twice", () => {
    render(<ToolModelTable models={mockModels} isLoading={false} />);
    const costButton = screen.getByRole("button", { name: /cost/i });
    // First click: already desc — switches to asc (lowest first)
    fireEvent.click(costButton);
    const rows = screen.getAllByRole("row");
    // Lowest cost (anthropic/claude-3-haiku at 0.08) should be first
    expect(rows[1]).toHaveTextContent("anthropic/claude-3-haiku");
  });

  it("sorts by request count when Requests button is clicked", () => {
    render(<ToolModelTable models={mockModels} isLoading={false} />);
    const requestsButton = screen.getByRole("button", { name: /requests/i });
    fireEvent.click(requestsButton);
    const rows = screen.getAllByRole("row");
    // Highest eventCount is openai/gpt-3.5-turbo (500)
    expect(rows[1]).toHaveTextContent("openai/gpt-3.5-turbo");
  });
});
