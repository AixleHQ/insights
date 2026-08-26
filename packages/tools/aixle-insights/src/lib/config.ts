import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mcpLog } from "../log.js";
import { describeReadFailure } from "./parse-error.js";

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
 * @param configDir Directory containing `config.json`, typically the app home directory
 *                  (`~/.aixle-insights`, or `AIXLE_INSIGHTS_HOME` when set).
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      // Config file exists but is not valid JSON — distinguishes tampering from "never created".
      // ENOENT stays silent: this file is optional and most users never create it.
      mcpLog.warn("config_parse_failed", { path: configPath, ...describeReadFailure(err) }, false);
    }
    return {};
  }
  // Valid JSON, but not a config object. Arrays are rejected explicitly because
  // `typeof [] === "object"` would otherwise let them reach the happy path and be handed
  // to `parsePricing`. Previously every non-object fell through silently. (AIX-699)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    mcpLog.warn("config_parse_failed", { path: configPath, reason: "invalid_shape" }, false);
    return {};
  }
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
