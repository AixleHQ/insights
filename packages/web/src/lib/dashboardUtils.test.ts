import { describe, it, expect } from "vitest";
import { fillDateGaps, formatDateLabel, formatLocalDate, sliceCostTrendWindow } from "./dashboardUtils";

describe("fillDateGaps", () => {
  const make = (date: string) => ({ date, cost: 0, events: 0 });

  it("fills a single missing day", () => {
    const data = [
      { date: "2026-04-27", cost: 1, events: 1 },
      { date: "2026-04-28", cost: 2, events: 1 },
      // Apr 29 missing
      { date: "2026-04-30", cost: 3, events: 1 },
    ];
    const result = fillDateGaps(data, make);
    expect(result.map((d) => d.date)).toEqual(["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"]);
    expect(result[2]).toEqual({ date: "2026-04-29", cost: 0, events: 0 });
  });

  it("returns data unchanged when no gaps exist", () => {
    const data = [
      { date: "2026-04-28", cost: 1, events: 1 },
      { date: "2026-04-29", cost: 2, events: 2 },
      { date: "2026-04-30", cost: 3, events: 3 },
    ];
    expect(fillDateGaps(data, make)).toEqual(data);
  });

  it("returns single-element array unchanged", () => {
    const data = [{ date: "2026-04-30", cost: 5, events: 1 }];
    expect(fillDateGaps(data, make)).toEqual(data);
  });
});

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
