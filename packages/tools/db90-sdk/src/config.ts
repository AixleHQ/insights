import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Common config envelope every connector's `config.json` file carries. Pricing
 * is connector-specific (claude = model-keyed, cursor = flat line-cost rates)
 * so it's extracted through a caller-provided parser rather than baked in.
 */
export interface BaseConfig {
  token?: string;
  host?: string;
  project_id?: string;
}

/**
 * Load a connector's `config.json` from disk. Returns `{}` on missing or
 * malformed files — callers fall back to env vars / CLI flags / defaults.
 *
 * @param configDir Directory containing `config.json`, typically the
 *                  connector's `APP_DIR` (`~/.db90-claude` / `~/.db90-cursor`).
 * @param parsePricing Optional callback that extracts a connector-specific
 *                     pricing shape from the raw parsed JSON. Returns
 *                     `undefined` when the pricing block is missing or invalid.
 *                     The callback is the extension point for connector-specific
 *                     validation (claude uses structural checks on a model map;
 *                     cursor coerces a fixed set of numeric rates).
 */
export function loadBaseConfig<TPricing = never>(
  configDir: string,
  parsePricing?: (raw: Record<string, unknown>) => TPricing | undefined
): BaseConfig & { pricing?: TPricing } {
  const configPath = join(configDir, "config.json");
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const result: BaseConfig & { pricing?: TPricing } = {
        token: typeof obj.token === "string" ? obj.token : undefined,
        host: typeof obj.host === "string" ? obj.host : undefined,
        project_id: typeof obj.project_id === "string" ? obj.project_id : undefined,
      };
      if (parsePricing) {
        const pricing = parsePricing(obj);
        if (pricing !== undefined) result.pricing = pricing;
      }
      return result;
    }
  } catch {
    // missing or invalid config — fall through
  }
  return {};
}
