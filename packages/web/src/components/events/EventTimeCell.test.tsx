import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventTimeCell } from "./EventTimeCell";
import { formatDateTime } from "@/lib/formatters";

describe("EventTimeCell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows calendar date with date-only tooltip for day-granularity events", () => {
    const at = "2026-06-22T00:00:00Z";
    render(<EventTimeCell toolName="github_copilot" occurredAt={at} />);

    const cell = screen.getByText("Jun 22, 2026");
    expect(cell).toHaveAttribute("title", "Jun 22, 2026");
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it("shows relative time with datetime tooltip for precise-time events", () => {
    const at = "2026-06-22T10:00:00Z";
    render(<EventTimeCell toolName="cursor" occurredAt={at} />);

    const cell = screen.getByText("2h ago");
    expect(cell).toHaveAttribute("title", formatDateTime(at));
  });
});
