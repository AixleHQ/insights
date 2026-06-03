import { loadBaseConfig } from "@db90/sdk";
import { getAppDir } from "./state.js";
import {
  DEFAULT_CURSOR_PRICING,
  type PricingConfig,
} from "./readers/cursor.js";

export function parseCursorPricing(
  raw: Record<string, unknown>
): Partial<PricingConfig> | undefined {
  const rawPricing =
    typeof raw.pricing === "object" && raw.pricing !== null
      ? (raw.pricing as Record<string, unknown>)
      : null;
  if (!rawPricing) return undefined;

  const pricing: Partial<PricingConfig> = {};
  for (const key of [
    "tokens_per_line",
    "completion_output_per_mtok",
    "chat_input_per_mtok",
    "chat_output_per_mtok",
  ] as const) {
    const value = rawPricing[key];
    if (value == null || value === "" || typeof value === "boolean") continue;
    const num = Number(value);
    if (!Number.isNaN(num) && num >= 0) pricing[key] = num;
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

/** Load optional Cursor line-cost overrides from `~/.db90-mcp/config.json`. */
export function loadCursorConfig(appDir?: string): Partial<PricingConfig> {
  return loadBaseConfig<Partial<PricingConfig>>(appDir ?? getAppDir(), parseCursorPricing)
    .pricing ?? {};
}

export function resolveCursorPricing(
  overrides?: Partial<PricingConfig>,
  appDir?: string
): PricingConfig {
  const fromFile = loadCursorConfig(appDir);
  return { ...DEFAULT_CURSOR_PRICING, ...fromFile, ...overrides };
}
