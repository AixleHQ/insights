import { describe, it, expect, vi } from "vitest";
import { formatDateLabel, formatLocalDate, isCurrentMonth, sliceCostTrendWindow, periodToDateRange } from "./dashboardUtils";

describe("formatDateLabel", () => {
  it("returns month+day for day granularity", () => {
    // Jun 17 2026 is a Wednesday — previously the 7d branch returned "Wed"
    expect(formatDateLabel("2026-06-17", "day")).toBe("Jun 17");
    expect(formatDateLabel("2026-06-01", "day")).toBe("Jun 1");
  });

  it("returns month+year for month granularity", () => {
    expect(formatDateLabel("2026-06-01", "month")).toBe("Jun 2026");
  });
});

describe("formatLocalDate", () => {
  it("formats a local calendar date as YYYY-MM-DD", () => {
    expect(formatLocalDate(new Date(2026, 5, 23))).toBe("2026-06-23");
  });
});

describe("isCurrentMonth", () => {
  it("returns true for the current calendar month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1));

    expect(isCurrentMonth("2026-07")).toBe(true);

    vi.useRealTimers();
  });

  it("returns false for a past or future month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1));

    expect(isCurrentMonth("2026-06")).toBe(false);
    expect(isCurrentMonth("2026-08")).toBe(false);

    vi.useRealTimers();
  });
});

describe("sliceCostTrendWindow", () => {
  const june2026 = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    return {
      date: `2026-06-${String(day).padStart(2, "0")}`,
      cost: day >= 17 && day <= 23 ? 10 : 0,
    };
  });

  const may2026 = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    return {
      date: `2026-05-${String(day).padStart(2, "0")}`,
      cost: day >= 25 ? 5 : 0,
    };
  });

  it("returns the last N entries for rolling (non-month) data", () => {
    const rolling = Array.from({ length: 30 }, (_, i) => ({ date: `2026-05-${String(i + 1).padStart(2, "0")}`, cost: i }));
    const result = sliceCostTrendWindow(rolling, 7, { monthScoped: false });
    expect(result).toHaveLength(7);
    expect(result[0]?.date).toBe("2026-05-24");
    expect(result[6]?.date).toBe("2026-05-30");
  });

  it("clamps to elapsed days in the current month before slicing 7d", () => {
    const result = sliceCostTrendWindow(june2026, 7, {
      monthScoped: true,
      today: new Date(2026, 5, 23),
    });
    expect(result.map((d) => d.date)).toEqual([
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
      "2026-06-22",
      "2026-06-23",
    ]);
    expect(result.reduce((sum, d) => sum + d.cost, 0)).toBe(70);
  });

  it("shows the last 7 days of a past month", () => {
    const result = sliceCostTrendWindow(may2026, 7, {
      monthScoped: true,
      today: new Date(2026, 5, 23),
    });
    expect(result.map((d) => d.date)).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
    ]);
  });

  it("returns fewer than 7 points when the month has not reached 7 elapsed days", () => {
    const result = sliceCostTrendWindow(june2026, 7, {
      monthScoped: true,
      today: new Date(2026, 5, 3),
    });
    expect(result.map((d) => d.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });
});

describe("periodToDateRange", () => {
  it("returns first/last day for a 31-day month", () => {
    expect(periodToDateRange({ type: "month", value: "2026-07" })).toEqual({
      start_date: "2026-07-01",
      end_date: "2026-07-31",
    });
  });

  it("returns first/last day for a 30-day month", () => {
    expect(periodToDateRange({ type: "month", value: "2026-06" })).toEqual({
      start_date: "2026-06-01",
      end_date: "2026-06-30",
    });
  });

  it("handles February in a leap year", () => {
    expect(periodToDateRange({ type: "month", value: "2024-02" })).toEqual({
      start_date: "2024-02-01",
      end_date: "2024-02-29",
    });
  });

  it("returns an empty range for all_time", () => {
    expect(periodToDateRange({ type: "all_time" })).toEqual({});
  });
});
