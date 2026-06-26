import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { CostTrendChart } from "./CostTrendChart";

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

});
