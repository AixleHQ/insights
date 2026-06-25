import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventsTable, type EventRow } from "./EventsTable";

vi.mock("@/components/ui/risk-badge", () => ({
  RiskBadge: ({ level }: { level: string }) => <span>{level}</span>,
}));

vi.mock("@/components/ui/event-type-badge", () => ({
  EventTypeBadge: ({ type }: { type?: string }) => <span>{type}</span>,
}));

vi.mock("@/lib/riskLevel", () => ({
  normalizeRiskLevel: (value: string | null | undefined) => value ?? "none",
}));

const baseEvent: EventRow = {
  id: "evt-1",
  tool_name: "cursor",
  event_type: "prompt_sent",
  risk_level: "low",
  cost_usd: 0.01,
  token_count: 100,
  project: { name: "Alpha" },
};

describe("EventsTable Time column", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an absolute date for github_copilot day-granularity events", () => {
    const events: EventRow[] = [
      {
        ...baseEvent,
        id: "copilot-1",
        tool_name: "github_copilot",
        created_at: "2026-06-22T00:00:00Z",
      },
    ];

    render(<EventsTable events={events} />);

    expect(screen.getByText("Jun 22, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it("shows relative time for precise-time events", () => {
    const events: EventRow[] = [
      {
        ...baseEvent,
        created_at: "2026-06-22T10:00:00Z",
      },
    ];

    render(<EventsTable events={events} />);

    expect(screen.getByText("2h ago")).toBeInTheDocument();
  });
});
