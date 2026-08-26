import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cursorUserDir } from "./readers/cursor.js";
import { openCursorSqliteReadonly } from "./readers/cursor-sqlite.js";

const SETTINGS_MODEL_KEYS = [
  "cursor.aiModel",
  "aiModel",
  "cursor.general.preferredModel",
  "model",
] as const;

export type CursorModelResolutionSource = "settings_json" | "state_vscdb" | "unresolved";

export interface CursorActiveModelResolution {
  model: string | null;
  source: CursorModelResolutionSource;
}

function readModelFromSettingsJson(dir: string): string | null {
  const settingsPath = join(dir, "settings.json");
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

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Reads the active model from Cursor's global state.vscdb (Cursor 1.6+), where settings.json
 * no longer carries it. The model lives in the cursorDiskKV table (verified against a real
 * Cursor install, 2026-07-10 — NOT ItemTable.aiSettings/featureModelConfigs, which don't exist
 * on current Cursor versions), one row per conversation keyed composerData:<composerId>. The
 * table is UNIQUE ON CONFLICT REPLACE, so every update to a composer re-inserts it with a fresh
 * (higher) rowid — ORDER BY rowid DESC LIMIT 1 gives the most recently touched composer without
 * needing to parse and rank every row's timestamp. Opens the DB only via openCursorSqliteReadonly
 * (read-only, root-contained) — never a raw new Database() call.
 */
function readCursorActiveModelFromStateDb(baseDir: string): string | null {
  const dbPath = join(baseDir, "globalStorage", "state.vscdb");
  const opened = openCursorSqliteReadonly(dbPath, { rootDir: baseDir });
  if (!opened.ok) return null;

  const { db } = opened;
  try {
    const hasTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'")
      .get();
    if (!hasTable) return null;

    const row = db
      .prepare(
        "SELECT value FROM cursorDiskKV WHERE key LIKE 'composerData:%' ORDER BY rowid DESC LIMIT 1"
      )
      .get() as { value: string } | undefined;
    if (!row) return null;

    const parsed = safeParseJson(row.value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const modelConfig = (parsed as Record<string, unknown>).modelConfig;
    if (typeof modelConfig !== "object" || modelConfig === null) return null;
    const mc = modelConfig as Record<string, unknown>;

    if (isNonEmptyString(mc.modelName)) return (mc.modelName as string).trim();

    const selectedModels = mc.selectedModels;
    if (Array.isArray(selectedModels) && selectedModels.length > 0) {
      const first = selectedModels[0] as Record<string, unknown> | undefined;
      if (isNonEmptyString(first?.modelId)) return (first.modelId as string).trim();
    }

    return null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Resolves Cursor's active model, chaining settings.json (pre-1.6 location) then
 * state.vscdb (1.6+ location). Reports which source supplied the model, or "unresolved"
 * when neither has it, so downstream payload metadata can record where the tool looked.
 */
export function readCursorActiveModel(baseDir?: string): CursorActiveModelResolution {
  const dir = baseDir ?? cursorUserDir();

  const fromSettings = readModelFromSettingsJson(dir);
  if (fromSettings) return { model: fromSettings, source: "settings_json" };

  const fromStateDb = readCursorActiveModelFromStateDb(dir);
  if (fromStateDb) return { model: fromStateDb, source: "state_vscdb" };

  return { model: null, source: "unresolved" };
}
