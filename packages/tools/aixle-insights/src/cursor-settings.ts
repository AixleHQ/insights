import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cursorUserDir } from "./readers/cursor.js";

// Keys are tried in specificity order — Cursor-namespaced keys first, then
// generic fallbacks. "model" is last to avoid capturing unrelated workspace
// settings that happen to have a "model" key.
const SETTINGS_MODEL_KEYS = [
  "cursor.aiModel",
  "aiModel",
  "cursor.general.preferredModel",
  "model",
] as const;

/**
 * Best-effort: read active model name from Cursor's settings.json.
 * Returns null on any error (file absent, unreadable, no matching key).
 * Never throws.
 */
export function readCursorActiveModel(baseDir?: string): string | null {
  const settingsPath = join(baseDir ?? cursorUserDir(), "settings.json");
  try {
    if (!existsSync(settingsPath)) return null;
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    for (const key of SETTINGS_MODEL_KEYS) {
      const val = obj[key];
      if (typeof val === "string" && val.trim().length > 0) return val.trim();
    }
    return null;
  } catch {
    return null;
  }
}
