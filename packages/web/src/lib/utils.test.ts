import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cn, formatDistanceToNow, formatCurrency, formatNumber, formatLocalDate, organizationMemberUserId } from "./utils";

describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("should handle conditional classes", () => {
    const isAdded = true;
    const isNotAdded = false;
    expect(cn("base", isAdded && "added", isNotAdded && "not-added")).toBe("base added");
  });

  it("should merge tailwind classes correctly", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });
});

describe("formatLocalDate", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
    vi.useRealTimers();
  });

  it("uses the user's local calendar day, not UTC (regression for AIX-498)", () => {
    // User at UTC+4 (Asia/Dubai, no DST): local wall-clock is July 2 00:30,
    // but the same instant is still July 1 in UTC.
    process.env.TZ = "Asia/Dubai";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T20:30:00Z"));

    expect(formatLocalDate(new Date())).toBe("2026-07-02");
  });

  it("pads single-digit month and day", () => {
    process.env.TZ = "UTC";
    expect(formatLocalDate(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });
});

describe("formatDistanceToNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for recent times', () => {
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10 * 1000);
    expect(formatDistanceToNow(tenSecondsAgo)).toBe("just now");
  });

  it("should return minutes for times within an hour", () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatDistanceToNow(fiveMinutesAgo)).toBe("5m ago");
  });

  it("should return hours for times within a day", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(formatDistanceToNow(twoHoursAgo)).toBe("2h ago");
  });

  it("should return days for times within a week", () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatDistanceToNow(threeDaysAgo)).toBe("3d ago");
  });

  it("should return weeks for times within a month", () => {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    expect(formatDistanceToNow(twoWeeksAgo)).toBe("2w ago");
  });

  it("should accept string dates", () => {
    expect(formatDistanceToNow("2026-01-26T11:55:00Z")).toBe("5m ago");
  });
});

describe("formatCurrency", () => {
  it("should format currency with 2 decimal places", () => {
    expect(formatCurrency(100)).toBe("$100.00");
    expect(formatCurrency(99.99)).toBe("$99.99");
    expect(formatCurrency(1234.567)).toBe("$1,234.57");
  });

  it("should handle zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("should handle large numbers", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00");
  });
});

describe("formatNumber", () => {
  it("should format numbers with thousand separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1000000)).toBe("1,000,000");
    expect(formatNumber(12345678)).toBe("12,345,678");
  });

  it("should handle small numbers", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(42)).toBe("42");
  });
});

describe("organizationMemberUserId", () => {
  it("falls back to nested user.id when top-level ids are absent", () => {
    expect(
      organizationMemberUserId({
        id: "om-1",
        role: "member",
        user: { id: "user-ana", email: "ana@example.com" },
      })
    ).toBe("user-ana");
  });

  it("prefers userId when present", () => {
    expect(organizationMemberUserId({ userId: "explicit-id", user: { id: "nested" } })).toBe(
      "explicit-id"
    );
  });
});
