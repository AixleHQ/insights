import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { CostTrendChart } from "./CostTrendChart";
import { formatDateLabel } from "@/lib/dashboardUtils";

function june2026ChartData() {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    return {
      date: `2026-06-${String(day).padStart(2, "0")}`,
      cost: day >= 17 && day <= 23 ? 10 : 0,
      events: day >= 17 && day <= 23 ? 1 : 0,
    };
  });
}

describe("CostTrendChart", () => {
  it("shows non-zero totals for month-scoped 7d view mid-month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 23, 12, 0, 0));

    render(<CostTrendChart data={june2026ChartData()} monthScoped />);

    expect(screen.getByText(/Total: \$70\.00/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows zero total when month-scoped slice would only include future days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 23, 12, 0, 0));

    render(<CostTrendChart data={june2026ChartData()} />);

    expect(screen.getByText(/Total: \$0\.00/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows month+day date labels (not weekday names) on 7d view", () => {
    // Jun 17 2026 is a Wednesday — previously returned "Wed", should now return "Jun 17"
    expect(formatDateLabel("2026-06-17", false)).toBe("Jun 17");
    expect(formatDateLabel("2026-06-18", false)).toBe("Jun 18");
    expect(formatDateLabel("2026-06-19", false)).toBe("Jun 19");
  });

  it("keeps month+day labels for day-range views", () => {
    expect(formatDateLabel("2026-06-01", false)).toBe("Jun 1");
  });

  it("keeps month+year labels for allTime view", () => {
    expect(formatDateLabel("2026-06-01", true)).toBe("Jun 2026");
  });
});
