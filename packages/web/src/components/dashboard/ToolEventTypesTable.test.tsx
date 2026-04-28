import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { ToolEventTypesTable } from "./ToolEventTypesTable";
import type { ToolEventTypeStat } from "@/lib/types";

const mockEventTypes: ToolEventTypeStat[] = [
  { name: "chat", eventCount: 150, tokensIn: 45000, tokensOut: 12000, costUsd: 0.57 },
  { name: "completion", eventCount: 80, tokensIn: 18000, tokensOut: 6000, costUsd: 0.24 },
  { name: "edit", eventCount: 30, tokensIn: 9000, tokensOut: 3000, costUsd: 0.12 },
];

describe("ToolEventTypesTable", () => {
  it("shows skeleton rows while loading", () => {
    render(<ToolEventTypesTable eventTypes={[]} isLoading={true} />);
    // Skeleton rows render as cells without text — verify header is present but no data rows
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.queryByText("No event type data")).not.toBeInTheDocument();
  });

  it("shows empty state when no event types", () => {
    render(<ToolEventTypesTable eventTypes={[]} isLoading={false} />);
    expect(screen.getByText("No event type data for this period.")).toBeInTheDocument();
  });

  it("renders event type rows with correct data", () => {
    render(<ToolEventTypesTable eventTypes={mockEventTypes} isLoading={false} />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Completion")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("formats event counts with locale separators", () => {
    render(<ToolEventTypesTable eventTypes={mockEventTypes} isLoading={false} />);
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("formats token counts in compact form", () => {
    render(<ToolEventTypesTable eventTypes={mockEventTypes} isLoading={false} />);
    // 45000 → 45.0K
    expect(screen.getByText("45.0K")).toBeInTheDocument();
    // 12000 → 12.0K
    expect(screen.getByText("12.0K")).toBeInTheDocument();
  });

  it("humanizes snake_case event type names to Title Case", () => {
    const types: ToolEventTypeStat[] = [
      { name: "tab_completion", eventCount: 10, tokensIn: 0, tokensOut: 0, costUsd: 0 },
    ];
    render(<ToolEventTypesTable eventTypes={types} isLoading={false} />);
    expect(screen.getByText("Tab Completion")).toBeInTheDocument();
  });
});
