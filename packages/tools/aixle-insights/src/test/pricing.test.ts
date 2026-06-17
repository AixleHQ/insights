import { describe, it, expect } from "vitest";
import {
  calculateCost,
  getCostWarning,
  normalizeModelId,
  DEFAULT_PRICING,
} from "../pricing.js";

describe("normalizeModelId", () => {
  it("returns bare ID unchanged when it exists in the table", () => {
    expect(normalizeModelId("claude-opus-4-7", DEFAULT_PRICING)).toBe("claude-opus-4-7");
  });

  it("strips date suffix when bare form exists in the table", () => {
    expect(normalizeModelId("claude-opus-4-7-20260101", DEFAULT_PRICING)).toBe("claude-opus-4-7");
    expect(normalizeModelId("claude-opus-4-6-20260315", DEFAULT_PRICING)).toBe("claude-opus-4-6");
    expect(normalizeModelId("claude-sonnet-4-6-20260201", DEFAULT_PRICING)).toBe("claude-sonnet-4-6");
    expect(normalizeModelId("claude-sonnet-4-5-20251001", DEFAULT_PRICING)).toBe("claude-sonnet-4-5");
    expect(normalizeModelId("claude-haiku-4-5-20251001", DEFAULT_PRICING)).toBe("claude-haiku-4-5");
  });

  it("preserves legacy dated IDs that ARE the canonical key", () => {
    expect(normalizeModelId("claude-3-5-sonnet-20241022", DEFAULT_PRICING)).toBe("claude-3-5-sonnet-20241022");
    expect(normalizeModelId("claude-3-5-haiku-20241022", DEFAULT_PRICING)).toBe("claude-3-5-haiku-20241022");
    expect(normalizeModelId("claude-3-opus-20240229", DEFAULT_PRICING)).toBe("claude-3-opus-20240229");
  });

  it("returns unknown dated IDs unchanged (no false normalization)", () => {
    expect(normalizeModelId("some-future-model-20270101", DEFAULT_PRICING)).toBe("some-future-model-20270101");
  });

  it("returns IDs without date suffix unchanged", () => {
    expect(normalizeModelId("claude-sonnet-4", DEFAULT_PRICING)).toBe("claude-sonnet-4");
    expect(normalizeModelId("unknown-model", DEFAULT_PRICING)).toBe("unknown-model");
  });
});

describe("calculateCost — dated model IDs", () => {
  it("resolves claude-opus-4-7-20260101 to $5/$25 rate", () => {
    // 1M input at $5/MTok + 1M output at $25/MTok = 30.0
    const cost = calculateCost("claude-opus-4-7-20260101", 1_000_000, 1_000_000, 0, 0, DEFAULT_PRICING);
    expect(cost).toBe(30.0);
  });

  it("resolves claude-opus-4-6-20260315 to $5/$25 rate", () => {
    const cost = calculateCost("claude-opus-4-6-20260315", 1_000_000, 1_000_000, 0, 0, DEFAULT_PRICING);
    expect(cost).toBe(30.0);
  });

  it("resolves claude-sonnet-4-6-20260201 to $3/$15 rate", () => {
    // 1M input at $3/MTok + 1M output at $15/MTok = 18.0
    const cost = calculateCost("claude-sonnet-4-6-20260201", 1_000_000, 1_000_000, 0, 0, DEFAULT_PRICING);
    expect(cost).toBe(18.0);
  });

  it("legacy claude-3-5-sonnet-20241022 still resolves (canonical dated key)", () => {
    const cost = calculateCost("claude-3-5-sonnet-20241022", 1_000_000, 1_000_000, 0, 0, DEFAULT_PRICING);
    expect(cost).toBe(18.0);
  });

  it("does NOT incorrectly map opus-4-7 to opus-4 ($15/$75) rate", () => {
    const cost = calculateCost("claude-opus-4-7-20260101", 1_000_000, 0, 0, 0, DEFAULT_PRICING);
    // Should be $5 (not $15)
    expect(cost).toBe(5.0);
  });

  it("unknown dated model returns null (not a false match)", () => {
    const cost = calculateCost("some-future-model-20270101", 1_000_000, 1_000_000, 0, 0, DEFAULT_PRICING);
    expect(cost).toBeNull();
  });
});

describe("getCostWarning — dated model IDs", () => {
  it("returns null (no warning) for resolvable dated IDs", () => {
    expect(getCostWarning("claude-opus-4-7-20260101", DEFAULT_PRICING)).toBeNull();
    expect(getCostWarning("claude-sonnet-4-6-20260201", DEFAULT_PRICING)).toBeNull();
  });

  it("returns a warning for truly unknown dated IDs", () => {
    const warning = getCostWarning("some-future-model-20270101", DEFAULT_PRICING);
    expect(warning).toContain("not in pricing table");
  });
});
