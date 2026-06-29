import { describe, it, expect } from "vitest";
import {
  calculateCost,
  getCostWarning,
  mergePricing,
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

describe("calculateCost", () => {
  it("returns null when model is null", () => {
    expect(calculateCost(null, 1000, 500, 0, 0, DEFAULT_PRICING)).toBeNull();
  });

  it("returns null when model is not in pricing table", () => {
    expect(calculateCost("unknown-model", 1000, 500, 0, 0, DEFAULT_PRICING)).toBeNull();
  });

  it("calculates cost with zero cache tokens (base input only)", () => {
    const cost = calculateCost("claude-sonnet-4-6", 1_000_000, 500_000, 0, 0, DEFAULT_PRICING);
    // input: 1M * $3.00/M = $3.00, output: 0.5M * $15.00/M = $7.50
    expect(cost).toBe(10.5);
  });

  it("applies cache_write rate separately from base input rate", () => {
    const cost = calculateCost("claude-sonnet-4-6", 500_000, 0, 200_000, 0, DEFAULT_PRICING);
    // base input: 0.5M * $3.00/M = $1.50, cache_write: 0.2M * $3.75/M = $0.75
    expect(cost).toBe(2.25);
  });

  it("applies cache_read rate (cheaper than input) separately", () => {
    const cost = calculateCost("claude-sonnet-4-6", 100_000, 0, 0, 900_000, DEFAULT_PRICING);
    // base input: 0.1M * $3.00/M = $0.30, cache_read: 0.9M * $0.30/M = $0.27
    expect(cost).toBe(0.57);
  });

  it("correctly calculates cost with all four token types", () => {
    const cost = calculateCost("claude-sonnet-4-6", 100_000, 200_000, 50_000, 800_000, DEFAULT_PRICING);
    // base: 0.1M * $3.00 = $0.30
    // output: 0.2M * $15.00 = $3.00
    // cache_write: 0.05M * $3.75 = $0.1875
    // cache_read: 0.8M * $0.30 = $0.24
    expect(cost).toBe(3.7275);
  });

  it("rounds to 6 decimal places to match DB precision", () => {
    const cost = calculateCost("claude-sonnet-4-6", 1, 1, 1, 1, DEFAULT_PRICING);
    // Tiny amounts — verifies rounding doesn't produce floating-point artifacts
    expect(cost).not.toBeNull();
    const decimalPlaces = cost!.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(6);
  });

  it("opus-4-7 cache_read is $0.50/Mtok (10x cheaper than input)", () => {
    const cost = calculateCost("claude-opus-4-7", 0, 0, 0, 1_000_000, DEFAULT_PRICING);
    // cache_read: 1M * $0.50/M = $0.50
    expect(cost).toBe(0.5);
  });

  it("demonstrates the cost difference: full-input vs cache-aware pricing", () => {
    // Typical cached session: 100K base, 900K cache_read, 200K output
    const correctCost = calculateCost("claude-sonnet-4-6", 100_000, 200_000, 0, 900_000, DEFAULT_PRICING);
    // If we naively priced all 1M (base+cache) at input rate:
    const naiveCost = calculateCost("claude-sonnet-4-6", 1_000_000, 200_000, 0, 0, DEFAULT_PRICING);

    // naive: 1M * $3 + 0.2M * $15 = $3 + $3 = $6
    // correct: 0.1M * $3 + 0.2M * $15 + 0.9M * $0.30 = $0.30 + $3 + $0.27 = $3.57
    expect(naiveCost).toBe(6.0);
    expect(correctCost).toBe(3.57);
    // The naive approach overestimates by ~68%
    expect(naiveCost! / correctCost!).toBeGreaterThan(1.5);
  });
});

describe("mergePricing", () => {
  it("overrides specific rates for existing model", () => {
    const overrides = { "claude-sonnet-4-6": { cache_read_per_mtok: 0.5 } } as any;
    const merged = mergePricing(DEFAULT_PRICING, overrides);
    expect(merged["claude-sonnet-4-6"].cache_read_per_mtok).toBe(0.5);
    expect(merged["claude-sonnet-4-6"].input_per_mtok).toBe(3.0); // unchanged
  });

  it("adds a new model with all four rates", () => {
    const overrides = {
      "custom-model": {
        input_per_mtok: 1.0,
        output_per_mtok: 2.0,
        cache_write_per_mtok: 1.5,
        cache_read_per_mtok: 0.1,
      },
    };
    const merged = mergePricing(DEFAULT_PRICING, overrides);
    expect(merged["custom-model"]).toEqual(overrides["custom-model"]);
  });

  it("does not mutate the base pricing table", () => {
    const original = { ...DEFAULT_PRICING["claude-sonnet-4-6"] };
    mergePricing(DEFAULT_PRICING, { "claude-sonnet-4-6": { input_per_mtok: 99 } } as any);
    expect(DEFAULT_PRICING["claude-sonnet-4-6"]).toEqual(original);
  });
});

describe("getCostWarning", () => {
  it("returns null for a model in the pricing table", () => {
    expect(getCostWarning("claude-sonnet-4-6", DEFAULT_PRICING)).toBeNull();
  });

  it("returns a warning for an unknown model", () => {
    const warning = getCostWarning("unknown-model", DEFAULT_PRICING);
    expect(warning).toContain("not in pricing table");
  });

  it("returns null when model is null", () => {
    expect(getCostWarning(null, DEFAULT_PRICING)).toBeNull();
  });
});
