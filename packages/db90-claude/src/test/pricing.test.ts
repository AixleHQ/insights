import { describe, it, expect } from "vitest";
import {
  calculateCost,
  getCostWarning,
  mergePricing,
  DEFAULT_PRICING,
  type PricingTable,
} from "../pricing.js";

const SONNET_PRICING: PricingTable = {
  "claude-3-5-sonnet-20241022": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
};

describe("calculateCost", () => {
  it("returns the correct cost for a known model with all token types", () => {
    // base: 1_000_000 input, 1_000_000 output, 1_000_000 cache_write, 1_000_000 cache_read
    // cost = (1*3 + 1*15 + 1*3.75 + 1*0.30) / 1 = 22.05
    const cost = calculateCost(
      "claude-3-5-sonnet-20241022",
      1_000_000,
      1_000_000,
      1_000_000,
      1_000_000,
      SONNET_PRICING
    );
    expect(cost).toBe(22.05);
  });

  it("returns 0 (not null) when all tokens are zero but model is known", () => {
    const cost = calculateCost("claude-3-5-sonnet-20241022", 0, 0, 0, 0, SONNET_PRICING);
    expect(cost).toBe(0);
  });

  it("returns correct cost with zero cache tokens", () => {
    // 100_000 input at $3/MTok, 50_000 output at $15/MTok = 0.30 + 0.75 = 1.05
    const cost = calculateCost("claude-3-5-sonnet-20241022", 100_000, 50_000, 0, 0, SONNET_PRICING);
    expect(cost).toBe(1.05);
  });

  it("returns null when model is null", () => {
    expect(calculateCost(null, 1000, 500, 0, 0, SONNET_PRICING)).toBeNull();
  });

  it("returns null when model is not in the pricing table", () => {
    expect(
      calculateCost("claude-future-model-20990101", 1000, 500, 0, 0, SONNET_PRICING)
    ).toBeNull();
  });

  it("returns null when any rate is non-finite (partial new-model override)", () => {
    const incomplete: PricingTable = {
      "new-model": {
        input_per_mtok: 5.0,
        output_per_mtok: undefined as unknown as number, // simulates missing JSON field
        cache_write_per_mtok: 6.25,
        cache_read_per_mtok: 0.5,
      },
    };
    expect(calculateCost("new-model", 1000, 500, 0, 0, incomplete)).toBeNull();
  });

  it("rounds to 6 decimal places", () => {
    // Construct a case that produces a long decimal
    // 1 input token at $3/MTok = 3/1_000_000 = 0.000003
    const cost = calculateCost("claude-3-5-sonnet-20241022", 1, 0, 0, 0, SONNET_PRICING);
    expect(cost).toBe(0.000003);
    expect(Number.isFinite(cost)).toBe(true);
  });

  it("uses the real README example values correctly", () => {
    // Existing README: 18420 tokensIn, 3210 out, 2100 cache-write, 8300 cache-read
    // model: claude-opus-4-5 ($15/$75/$18.75/$1.50)
    // baseInput = 18420 - 2100 - 8300 = 8020
    // cost = (8020*15 + 3210*75 + 2100*18.75 + 8300*1.50) / 1_000_000
    //      = (120300 + 240750 + 39375 + 12450) / 1_000_000
    //      = 412875 / 1_000_000 = 0.412875
    const cost = calculateCost(
      "claude-opus-4-5",
      8020,
      3210,
      2100,
      8300,
      DEFAULT_PRICING
    );
    expect(cost).toBe(0.412875);
  });
});

describe("mergePricing", () => {
  it("returns a new table reference, not the same object as base", () => {
    const result = mergePricing(DEFAULT_PRICING, {});
    expect(result).not.toBe(DEFAULT_PRICING);
  });

  it("preserves default models not present in overrides", () => {
    const result = mergePricing(DEFAULT_PRICING, {});
    expect(result["claude-sonnet-4-6"]).toEqual(DEFAULT_PRICING["claude-sonnet-4-6"]);
  });

  it("allows a partial override of one field for an existing model", () => {
    const result = mergePricing(DEFAULT_PRICING, {
      "claude-sonnet-4-6": { input_per_mtok: 99.0 } as never,
    });
    expect(result["claude-sonnet-4-6"].input_per_mtok).toBe(99.0);
    // Other fields fall back to defaults
    expect(result["claude-sonnet-4-6"].output_per_mtok).toBe(15.0);
    expect(result["claude-sonnet-4-6"].cache_write_per_mtok).toBe(3.75);
    expect(result["claude-sonnet-4-6"].cache_read_per_mtok).toBe(0.3);
  });

  it("user override wins for an existing model's field", () => {
    const result = mergePricing(DEFAULT_PRICING, {
      "claude-opus-4-6": {
        input_per_mtok: 20.0,
        output_per_mtok: 80.0,
        cache_write_per_mtok: 25.0,
        cache_read_per_mtok: 2.0,
      },
    });
    expect(result["claude-opus-4-6"]).toEqual({
      input_per_mtok: 20.0,
      output_per_mtok: 80.0,
      cache_write_per_mtok: 25.0,
      cache_read_per_mtok: 2.0,
    });
  });

  it("accepts a fully-specified new model and calculateCost returns a valid number", () => {
    const result = mergePricing(DEFAULT_PRICING, {
      "claude-future-model": {
        input_per_mtok: 5.0,
        output_per_mtok: 20.0,
        cache_write_per_mtok: 6.25,
        cache_read_per_mtok: 0.5,
      },
    });
    const cost = calculateCost("claude-future-model", 1_000_000, 1_000_000, 0, 0, result);
    expect(cost).toBe(25.0);
  });

  it("new model with only one field causes calculateCost to return null", () => {
    const result = mergePricing(DEFAULT_PRICING, {
      "claude-partial-model": { input_per_mtok: 5.0 } as never,
    });
    const cost = calculateCost("claude-partial-model", 1000, 500, 0, 0, result);
    expect(cost).toBeNull();
  });

  it("does not mutate the base pricing table", () => {
    const snapshot = JSON.stringify(DEFAULT_PRICING);
    mergePricing(DEFAULT_PRICING, {
      "claude-sonnet-4-6": { input_per_mtok: 999.0 } as never,
    });
    expect(JSON.stringify(DEFAULT_PRICING)).toBe(snapshot);
  });
});

describe("getCostWarning", () => {
  it("returns null when model is null (no warning needed from this helper)", () => {
    expect(getCostWarning(null, DEFAULT_PRICING)).toBeNull();
  });

  it("returns null when model is known and all rates are finite", () => {
    expect(getCostWarning("claude-sonnet-4-6", DEFAULT_PRICING)).toBeNull();
  });

  it("returns a warning when model is absent from the pricing table", () => {
    const warning = getCostWarning("claude-unknown-model", DEFAULT_PRICING);
    expect(warning).toContain("claude-unknown-model");
    expect(warning).toContain("not in pricing table");
  });

  it("returns a warning when model is in the table but rates are incomplete", () => {
    const incomplete: PricingTable = {
      "new-model": {
        input_per_mtok: 5.0,
        output_per_mtok: NaN,
        cache_write_per_mtok: 6.25,
        cache_read_per_mtok: 0.5,
      },
    };
    const warning = getCostWarning("new-model", incomplete);
    expect(warning).toContain("Incomplete pricing");
    expect(warning).toContain("new-model");
  });
});
