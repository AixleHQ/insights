import { describe, it, expect } from "vitest";
import { formatCost, formatTokens, getEventActorLabel, EventAttribution } from "./formatters";

describe("formatCost", () => {
  it("returns $0.00 for zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("returns 6 decimal places for micro-costs < $0.001", () => {
    expect(formatCost(0.000123)).toBe("$0.000123");
  });

  it("returns 4 decimal places for costs < $0.01", () => {
    expect(formatCost(0.0012)).toBe("$0.0012");
  });

  it("returns US locale currency for normal amounts", () => {
    expect(formatCost(1234.56)).toBe("$1,234.56");
  });
});

describe("formatTokens", () => {
  it("returns exact number for < 1000", () => {
    expect(formatTokens(842)).toBe("842");
  });

  it("returns K suffix for thousands", () => {
    expect(formatTokens(125000)).toBe("125.0K");
  });

  it("returns M suffix for millions", () => {
    expect(formatTokens(1200000)).toBe("1.2M");
  });
});

describe("getEventActorLabel", () => {
  it("returns email when user has email", () => {
    const event = { user: { email: "alice@example.com" }, attribution: "user" };
    expect(getEventActorLabel(event)).toBe("alice@example.com");
  });

  it('returns "Organization" for organization attribution without user', () => {
    const event = { user: null, attribution: "organization" };
    expect(getEventActorLabel(event)).toBe("Organization");
  });

  it('returns "Service" for service attribution', () => {
    const event = { user: null, attribution: "service" };
    expect(getEventActorLabel(event)).toBe("Service");
  });

  it('returns "-" for unknown attribution', () => {
    const event = { user: null, attribution: "unknown" };
    expect(getEventActorLabel(event)).toBe("-");
  });

  it('returns "-" when attribution is missing', () => {
    const event = { user: null };
    expect(getEventActorLabel(event)).toBe("-");
  });

  it("prefers user email over attribution label", () => {
    const event = { user: { email: "bob@example.com" }, attribution: "organization" };
    expect(getEventActorLabel(event)).toBe("bob@example.com");
  });

  it('returns "-" for unrecognized attribution value', () => {
    const event = { user: null, attribution: "something_else" };
    expect(getEventActorLabel(event)).toBe("-");
  });
});

describe("EventAttribution", () => {
  it("has the expected values", () => {
    expect(EventAttribution.USER).toBe("user");
    expect(EventAttribution.ORGANIZATION).toBe("organization");
    expect(EventAttribution.SERVICE).toBe("service");
    expect(EventAttribution.UNKNOWN).toBe("unknown");
  });
});
