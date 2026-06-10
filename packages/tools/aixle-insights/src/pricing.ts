/**
 * Model pricing table and cost calculation for @aixle/insights.
 *
 * Default rates source: https://platform.claude.com/docs/en/about-claude/pricing
 * Rates last verified: 2026-05-04
 */

export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_write_per_mtok: number;
  cache_read_per_mtok: number;
}

export type PricingTable = Record<string, ModelPricing>;

/**
 * Default pricing table (USD per million tokens).
 * Covers the Claude model IDs most commonly seen in Claude Code transcripts.
 *
 * NOTE: Sessions may use multiple models but SessionAggregate stores only
 * the last-seen model. Cost is calculated as if all tokens in the session
 * used that model. This is a known approximation; per-model-per-session
 * breakdown is a future improvement.
 */
export const DEFAULT_PRICING: PricingTable = {
  // Opus 4.7/4.6/4.5 — $5 input / $25 output
  "claude-opus-4-7": {
    input_per_mtok: 5.0,
    output_per_mtok: 25.0,
    cache_write_per_mtok: 6.25,
    cache_read_per_mtok: 0.5,
  },
  "claude-opus-4-6": {
    input_per_mtok: 5.0,
    output_per_mtok: 25.0,
    cache_write_per_mtok: 6.25,
    cache_read_per_mtok: 0.5,
  },
  "claude-opus-4-5": {
    input_per_mtok: 5.0,
    output_per_mtok: 25.0,
    cache_write_per_mtok: 6.25,
    cache_read_per_mtok: 0.5,
  },
  // Opus 4.1/4 — $15 input / $75 output
  "claude-opus-4-1": {
    input_per_mtok: 15.0,
    output_per_mtok: 75.0,
    cache_write_per_mtok: 18.75,
    cache_read_per_mtok: 1.5,
  },
  "claude-opus-4": {
    input_per_mtok: 15.0,
    output_per_mtok: 75.0,
    cache_write_per_mtok: 18.75,
    cache_read_per_mtok: 1.5,
  },
  // Sonnet 4.x family — $3 input / $15 output
  "claude-sonnet-4": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
  "claude-sonnet-4-6": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
  "claude-sonnet-4-5-20251001": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
  // Haiku 4.5 — $1 input / $5 output
  "claude-haiku-4-5-20251001": {
    input_per_mtok: 1.0,
    output_per_mtok: 5.0,
    cache_write_per_mtok: 1.25,
    cache_read_per_mtok: 0.1,
  },
  // Legacy Claude 3.x models
  "claude-3-5-sonnet-20241022": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
  "claude-3-5-haiku-20241022": {
    input_per_mtok: 0.8,
    output_per_mtok: 4.0,
    cache_write_per_mtok: 1.0,
    cache_read_per_mtok: 0.08,
  },
  "claude-3-opus-20240229": {
    input_per_mtok: 15.0,
    output_per_mtok: 75.0,
    cache_write_per_mtok: 18.75,
    cache_read_per_mtok: 1.5,
  },
};

/**
 * Deep-merges user-supplied overrides on top of base, per model.
 *
 * - For models already in base: any subset of the four rate fields may be
 *   supplied; missing fields fall back to the base value for that model.
 * - For NEW model IDs not in base: all four *_per_mtok fields are required.
 *   If any rate is missing or non-finite after merge, calculateCost will
 *   return null rather than produce NaN. getCostWarning will explain why.
 * - Returns a new table object so mutations never affect DEFAULT_PRICING.
 */
export function mergePricing(base: PricingTable, overrides: PricingTable): PricingTable {
  const result: PricingTable = { ...base };
  for (const [model, rates] of Object.entries(overrides)) {
    const merged: Partial<ModelPricing> = { ...(base[model] ?? {}), ...rates };
    result[model] = merged as ModelPricing;
  }
  return result;
}

/** Returns true only when all four rate fields are finite numbers. */
function hasValidRates(rates: ModelPricing): boolean {
  return (
    Number.isFinite(rates.input_per_mtok) &&
    Number.isFinite(rates.output_per_mtok) &&
    Number.isFinite(rates.cache_write_per_mtok) &&
    Number.isFinite(rates.cache_read_per_mtok)
  );
}

export function calculateCost(
  model: string | null,
  baseInputTokens: number,
  outputTokens: number,
  cacheWriteTokens: number,
  cacheReadTokens: number,
  pricing: PricingTable
): number | null {
  if (!model) return null;
  const rates = pricing[model];
  if (!rates || !hasValidRates(rates)) return null;

  const raw =
    (baseInputTokens * rates.input_per_mtok +
      outputTokens * rates.output_per_mtok +
      cacheWriteTokens * rates.cache_write_per_mtok +
      cacheReadTokens * rates.cache_read_per_mtok) /
    1_000_000;

  // Round to 6 decimal places to match DB DECIMAL(10,6) precision
  return Math.round(raw * 1_000_000) / 1_000_000;
}

/**
 * Returns a human-readable warning string explaining why cost could not be
 * computed, or null if cost should be calculable (no warning needed).
 */
export function getCostWarning(model: string | null, pricing: PricingTable): string | null {
  if (!model) return null;
  const rates = pricing[model];
  if (!rates) {
    return `Model "${model}" not in pricing table — cost_usd will be null. Extend DEFAULT_PRICING or add future pricing overrides when supported.`;
  }
  if (!hasValidRates(rates)) {
    return `Incomplete pricing for "${model}" — all four *_per_mtok fields are required for new model IDs. cost_usd will be null.`;
  }
  return null;
}
