/**
 * CUR-V12 — read-only spot-check of `cursorDiskKV` shapes vs DATA-CURSOR.md §2.2.
 * Does not persist prompt text; redacts summaries and bubble bodies in reports.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { findStateVscDbs, isGlobalStateDbPath } from "./cursor-reader.js";
import { redactCursorPath } from "./store-audit.js";

export const DISK_KV_TABLE = "cursorDiskKV";

type JsonObject = Record<string, unknown>;

export interface FieldShapeCheck {
  field: string;
  optional: boolean;
  present: boolean;
  actual_type: string | null;
  matches: boolean;
  note?: string;
}

export interface ParsedBlobSample {
  key: string;
  /** Redacted JSON-safe snapshot for verification docs. */
  fields_redacted: JsonObject;
  shape: {
    /** Flexible checks for current Cursor builds (CUR-V12). */
    matches_observed: boolean;
    /** Strict match to DATA-CURSOR.md §2.2 minimal example JSON. */
    matches_doc_example: boolean;
    checks: FieldShapeCheck[];
    extra_top_level_keys: string[];
    resolved?: Record<string, string | number | boolean | null>;
  };
}

export interface DiskKvKeyCounts {
  composer_data: number;
  bubble_id: number;
  mcp: number;
  inline_diff: number;
  other: number;
  total: number;
}

export interface DiskKvSpotCheckReport {
  captured_at: string;
  platform: NodeJS.Platform;
  db_path_redacted: string;
  table_exists: boolean;
  sqlite_ok: boolean;
  key_counts: DiskKvKeyCounts | null;
  sample_composer: ParsedBlobSample | null;
  sample_bubble: ParsedBlobSample | null;
  /** True when both samples pass observed-shape checks (current Cursor builds). */
  shape_matches_observed: boolean;
  /** True when both samples match the §2.2 example JSON literally. */
  shape_matches_doc_example: boolean;
  ingest_scope_note: string;
  error: string | null;
}

type ExpectedField = { name: string; types: string[]; optional?: boolean };

const COMPOSER_EXPECTED: ExpectedField[] = [
  { name: "composerId", types: ["string"] },
  { name: "version", types: ["number"] },
  { name: "createdAt", types: ["number"] },
  { name: "mode", types: ["string"] },
  { name: "latestConversationSummary", types: ["string"], optional: true },
  { name: "ruleCount", types: ["number"], optional: true },
];

const BUBBLE_EXPECTED: ExpectedField[] = [
  { name: "bubbleId", types: ["string"] },
  { name: "composerId", types: ["string"] },
  { name: "type", types: ["number"] },
  { name: "createdAt", types: ["number"] },
  { name: "text", types: ["string"], optional: true },
  { name: "codeBlocks", types: ["object"], optional: true },
  { name: "toolFormerData", types: ["object"], optional: true },
  { name: "thinking", types: ["object", "null", "undefined"], optional: true },
];

function typeofField(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function fieldMatchesType(value: unknown, types: string[]): boolean {
  const actual = typeofField(value);
  if (types.includes(actual)) return true;
  if (types.includes("undefined") && value === undefined) return true;
  if (types.includes("object") && actual === "array") return true;
  return false;
}

export function validateBlobShape(
  obj: JsonObject,
  expected: ExpectedField[]
): { matches: boolean; checks: FieldShapeCheck[]; extraTopLevelKeys: string[] } {
  const expectedNames = new Set(expected.map((f) => f.name));
  const checks: FieldShapeCheck[] = expected.map((field) => {
    const present = Object.prototype.hasOwnProperty.call(obj, field.name);
    const value = obj[field.name];
    const actualType = present ? typeofField(value) : null;
    const matches =
      !present && field.optional
        ? true
        : present && fieldMatchesType(value, field.types);
    return {
      field: field.name,
      optional: Boolean(field.optional),
      present,
      actual_type: actualType,
      matches,
    };
  });

  const extraTopLevelKeys = Object.keys(obj).filter((k) => !expectedNames.has(k));
  const matches = checks.every((c) => c.matches);
  return { matches, checks, extraTopLevelKeys };
}

export function redactComposerSample(obj: JsonObject): JsonObject {
  const out: JsonObject = {};
  const allow = [
    "composerId",
    "version",
    "_v",
    "createdAt",
    "lastUpdatedAt",
    "mode",
    "unifiedMode",
    "isAgentic",
    "agentBackend",
    "ruleCount",
    "latestConversationSummary",
    "name",
    "subtitle",
    "totalLinesAdded",
    "totalLinesRemoved",
  ] as const;
  for (const key of allow) {
    if (key in obj) out[key] = obj[key];
  }
  if (typeof out.latestConversationSummary === "string") {
    out.latestConversationSummary = `[redacted, ${out.latestConversationSummary.length} chars]`;
  }
  if (typeof out.text === "string") {
    out.text = `[redacted, ${out.text.length} chars]`;
  }
  if (typeof out.richText === "string") {
    out.richText = `[redacted, ${out.richText.length} chars]`;
  }
  return out;
}

function redactToolFormerData(value: unknown): JsonObject | JsonObject[] | null {
  if (Array.isArray(value)) {
    return value.map((entry) => redactToolFormerEntry(entry));
  }
  if (typeof value === "object" && value !== null) {
    return redactToolFormerEntry(value);
  }
  return null;
}

function redactToolFormerEntry(entry: unknown): JsonObject {
  if (typeof entry !== "object" || entry === null) return {};
  const e = entry as JsonObject;
  return {
    tool: e.tool,
    name: e.name,
    status: e.status,
    filePath:
      typeof e.filePath === "string"
        ? e.filePath.replace(/^.*[/\\]/, "[…]/")
        : e.filePath,
  };
}

export function redactBubbleSample(obj: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const key of ["bubbleId", "type", "createdAt", "_v", "isAgentic", "unifiedMode"] as const) {
    if (key in obj) out[key] = obj[key];
  }
  if (typeof obj.text === "string") {
    out.text = `[redacted, ${obj.text.length} chars]`;
  }
  if (Array.isArray(obj.codeBlocks)) {
    out.codeBlocks = obj.codeBlocks.map((block) => {
      if (typeof block !== "object" || block === null) return block;
      const b = block as JsonObject;
      return { language: b.language, lineCount: b.lineCount };
    });
  }
  const tools = redactToolFormerData(obj.toolFormerData);
  if (tools !== null) out.toolFormerData = tools;
  return out;
}

function parseJsonObject(raw: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  } catch {
    return null;
  }
  return null;
}

function createdAtMs(obj: JsonObject): number {
  const v = obj.createdAt;
  return typeof v === "number" ? v : 0;
}

function countDiskKvKeys(db: Database.Database): DiskKvKeyCounts {
  const rows = db
    .prepare(
      `SELECT
        sum(CASE WHEN key LIKE 'composerData:%' THEN 1 ELSE 0 END) AS composer_data,
        sum(CASE WHEN key LIKE 'bubbleId:%' THEN 1 ELSE 0 END) AS bubble_id,
        sum(CASE WHEN key LIKE 'mcp%' THEN 1 ELSE 0 END) AS mcp,
        sum(CASE WHEN key LIKE 'inlineDiff%' THEN 1 ELSE 0 END) AS inline_diff,
        count(*) AS total
      FROM ${DISK_KV_TABLE}`
    )
    .get() as {
    composer_data: number | null;
    bubble_id: number | null;
    mcp: number | null;
    inline_diff: number | null;
    total: number;
  };

  const composer = rows.composer_data ?? 0;
  const bubble = rows.bubble_id ?? 0;
  const mcp = rows.mcp ?? 0;
  const inline = rows.inline_diff ?? 0;

  return {
    composer_data: composer,
    bubble_id: bubble,
    mcp,
    inline_diff: inline,
    other: rows.total - composer - bubble - mcp - inline,
    total: rows.total,
  };
}

function pickLatestComposerRow(
  db: Database.Database
): { key: string; value: string } | null {
  const candidates = db
    .prepare(
      `SELECT key, value FROM ${DISK_KV_TABLE}
       WHERE key LIKE 'composerData:%'
       ORDER BY rowid DESC
       LIMIT 25`
    )
    .all() as { key: string; value: string }[];

  let best: { key: string; value: string; at: number } | null = null;
  for (const row of candidates) {
    const obj = parseJsonObject(row.value);
    if (!obj) continue;
    const at = createdAtMs(obj);
    if (!best || at > best.at) {
      best = { ...row, at };
    }
  }
  return best ? { key: best.key, value: best.value } : null;
}

function pickBubbleForComposer(
  db: Database.Database,
  composerId: string,
  preferToolFormer: boolean
): { key: string; value: string } | null {
  const prefix = `bubbleId:${composerId}:`;
  const candidates = db
    .prepare(
      `SELECT key, value FROM ${DISK_KV_TABLE}
       WHERE key LIKE ?
       ORDER BY rowid DESC
       LIMIT 40`
    )
    .all(`${prefix}%`) as { key: string; value: string }[];

  let best: { key: string; value: string; at: number; score: number } | null = null;
  for (const row of candidates) {
    const obj = parseJsonObject(row.value);
    if (!obj) continue;
    const hasTools =
      Array.isArray(obj.toolFormerData) && obj.toolFormerData.length > 0;
    if (preferToolFormer && !hasTools) continue;
    const at = createdAtMs(obj);
    const score = (preferToolFormer && hasTools ? 10 : 0) + at;
    if (!best || score > best.score) {
      best = { ...row, at, score };
    }
  }

  if (!best && preferToolFormer) {
    return pickBubbleForComposer(db, composerId, false);
  }
  return best ? { key: best.key, value: best.value } : null;
}

function composerIdFromKey(key: string): string | null {
  const m = key.match(/^composerData:(.+)$/);
  return m?.[1] ?? null;
}

function bubbleIdsFromKey(key: string): { composerId: string; bubbleId: string } | null {
  const m = key.match(/^bubbleId:([^:]+):(.+)$/);
  if (!m) return null;
  return { composerId: m[1], bubbleId: m[2] };
}

function timestampField(obj: JsonObject): { field: string; value: string | number } | null {
  for (const field of [
    "createdAt",
    "lastUpdatedAt",
    "conversationCheckpointLastUpdatedAt",
  ] as const) {
    const v = obj[field];
    if (typeof v === "number" || typeof v === "string") return { field, value: v };
  }
  return null;
}

function modeField(obj: JsonObject): { field: string; value: string | number | boolean } | null {
  if (typeof obj.mode === "string") return { field: "mode", value: obj.mode };
  if (typeof obj.unifiedMode === "string") return { field: "unifiedMode", value: obj.unifiedMode };
  if (typeof obj.agentBackend === "string") return { field: "agentBackend", value: obj.agentBackend };
  if (typeof obj.isAgentic === "boolean") return { field: "isAgentic", value: obj.isAgentic };
  return null;
}

function versionField(obj: JsonObject): { field: string; value: number } | null {
  if (typeof obj.version === "number") return { field: "version", value: obj.version };
  if (typeof obj._v === "number") return { field: "_v", value: obj._v };
  return null;
}

export function validateComposerObserved(
  key: string,
  obj: JsonObject
): { matches: boolean; checks: FieldShapeCheck[]; resolved: Record<string, string | number | boolean | null> } {
  const checks: FieldShapeCheck[] = [];
  const resolved: Record<string, string | number | boolean | null> = {};

  const composerId =
    typeof obj.composerId === "string" ? obj.composerId : composerIdFromKey(key);
  checks.push({
    field: "composerId",
    optional: false,
    present: composerId !== null,
    actual_type: composerId === null ? null : "string",
    matches: composerId !== null,
  });
  if (composerId) resolved.composerId = composerId;

  const ts = timestampField(obj);
  checks.push({
    field: "createdAt|lastUpdatedAt",
    optional: false,
    present: ts !== null,
    actual_type: ts === null ? null : typeof ts.value,
    matches: ts !== null,
    note: ts?.field,
  });
  if (ts) resolved[ts.field] = ts.value;

  const mode = modeField(obj);
  checks.push({
    field: "mode|unifiedMode|isAgentic",
    optional: false,
    present: mode !== null,
    actual_type: mode === null ? null : typeof mode.value,
    matches: mode !== null,
    note: mode?.field,
  });
  if (mode) resolved[mode.field] = mode.value;

  const ver = versionField(obj);
  checks.push({
    field: "version|_v",
    optional: true,
    present: ver !== null,
    actual_type: ver === null ? null : "number",
    matches: true,
    note: ver?.field,
  });
  if (ver) resolved[ver.field] = ver.value;

  return { matches: checks.every((c) => c.matches), checks, resolved };
}

export function validateBubbleObserved(
  key: string,
  obj: JsonObject
): { matches: boolean; checks: FieldShapeCheck[]; resolved: Record<string, string | number | boolean | null> } {
  const checks: FieldShapeCheck[] = [];
  const resolved: Record<string, string | number | boolean | null> = {};
  const fromKey = bubbleIdsFromKey(key);

  const bubbleId =
    typeof obj.bubbleId === "string" ? obj.bubbleId : fromKey?.bubbleId ?? null;
  checks.push({
    field: "bubbleId",
    optional: false,
    present: bubbleId !== null,
    actual_type: bubbleId === null ? null : "string",
    matches: bubbleId !== null,
  });
  if (bubbleId) resolved.bubbleId = bubbleId;

  const composerId =
    typeof obj.composerId === "string" ? obj.composerId : fromKey?.composerId ?? null;
  checks.push({
    field: "composerId (body or key)",
    optional: false,
    present: composerId !== null,
    actual_type: composerId === null ? null : "string",
    matches: composerId !== null,
  });
  if (composerId) resolved.composerId = composerId;

  checks.push({
    field: "type",
    optional: false,
    present: typeof obj.type === "number",
    actual_type: typeof obj.type === "number" ? "number" : typeofField(obj.type),
    matches: typeof obj.type === "number",
  });
  if (typeof obj.type === "number") resolved.type = obj.type;

  const ts = timestampField(obj);
  checks.push({
    field: "createdAt",
    optional: false,
    present: ts !== null,
    actual_type: ts === null ? null : typeof ts.value,
    matches: ts !== null,
    note: ts?.field,
  });
  if (ts) resolved[ts.field] = ts.value;

  const tf = obj.toolFormerData;
  const hasToolFormer =
    (Array.isArray(tf) && tf.length > 0) ||
    (typeof tf === "object" && tf !== null && !Array.isArray(tf));
  checks.push({
    field: "toolFormerData",
    optional: true,
    present: hasToolFormer,
    actual_type: tf === undefined ? null : Array.isArray(tf) ? "array" : typeof tf,
    matches: true,
  });
  if (hasToolFormer) {
    const entry = Array.isArray(tf) ? tf[0] : tf;
    if (typeof entry === "object" && entry !== null) {
      const e = entry as JsonObject;
      if (e.tool !== undefined) resolved.toolFormerData_tool = String(e.tool);
      if (typeof e.name === "string") resolved.toolFormerData_name = e.name;
    }
  }

  return { matches: checks.every((c) => c.matches), checks, resolved };
}

function buildComposerSample(key: string, value: string): ParsedBlobSample | null {
  const obj = parseJsonObject(value);
  if (!obj) return null;
  const strict = validateBlobShape(obj, COMPOSER_EXPECTED);
  const observed = validateComposerObserved(key, obj);
  return {
    key,
    fields_redacted: redactComposerSample(obj),
    shape: {
      matches_observed: observed.matches,
      matches_doc_example: strict.matches,
      checks: observed.checks,
      extra_top_level_keys: strict.extraTopLevelKeys,
      resolved: observed.resolved,
    },
  };
}

function buildBubbleSample(key: string, value: string): ParsedBlobSample | null {
  const obj = parseJsonObject(value);
  if (!obj) return null;
  const strict = validateBlobShape(obj, BUBBLE_EXPECTED);
  const observed = validateBubbleObserved(key, obj);
  return {
    key,
    fields_redacted: redactBubbleSample(obj),
    shape: {
      matches_observed: observed.matches,
      matches_doc_example: strict.matches,
      checks: observed.checks,
      extra_top_level_keys: strict.extraTopLevelKeys,
      resolved: observed.resolved,
    },
  };
}

export function diskKvIngestScopeNote(
  observedMatch: boolean,
  docExampleMatch: boolean
): string {
  const scope =
    "Per-session cursorDiskKV ingest is out of scope for AIX-235; track as cursor-5 (TOKENS.md §8). " +
    "Shipped path remains dailyStats + recentCommit aggregates.";

  if (!observedMatch) {
    return `Could not validate observed composer/bubble shapes on this install. ${scope}`;
  }
  if (!docExampleMatch) {
    return (
      "Observed blobs differ from DATA-CURSOR.md §2.2 example JSON (e.g. `_v`, `unifiedMode`, ISO `createdAt`). " +
      `Parser work must target observed fields, not the minimal doc example. ${scope}`
    );
  }
  return `Observed shapes match §2.2 example. ${scope}`;
}

function globalStateDbPath(baseDir?: string): string {
  const paths = findStateVscDbs(baseDir);
  return (
    paths.find((p) => isGlobalStateDbPath(p)) ??
    join(
      baseDir ?? join(homedir(), "Library", "Application Support", "Cursor", "User"),
      "globalStorage",
      "state.vscdb"
    )
  );
}

/**
 * Read-only spot-check of global `state.vscdb` → `cursorDiskKV` (CUR-V12).
 */
export function spotCheckCursorDiskKv(baseDir?: string): DiskKvSpotCheckReport {
  const dbPath = globalStateDbPath(baseDir);
  const base: Omit<DiskKvSpotCheckReport, "key_counts" | "sample_composer" | "sample_bubble"> = {
    captured_at: new Date().toISOString(),
    platform: process.platform,
    db_path_redacted: redactCursorPath(dbPath),
    table_exists: false,
    sqlite_ok: false,
    shape_matches_observed: false,
    shape_matches_doc_example: false,
    ingest_scope_note: "",
    error: null,
  };

  if (!existsSync(dbPath)) {
    return {
      ...base,
      key_counts: null,
      sample_composer: null,
      sample_bubble: null,
      error: "global state.vscdb not found",
      ingest_scope_note: diskKvIngestScopeNote(false, false),
    };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(DISK_KV_TABLE) as { name: string } | undefined;

    if (!table) {
      return {
        ...base,
        sqlite_ok: true,
        key_counts: null,
        sample_composer: null,
        sample_bubble: null,
        error: `${DISK_KV_TABLE} table missing`,
        ingest_scope_note: diskKvIngestScopeNote(false, false),
      };
    }

    base.table_exists = true;
    base.sqlite_ok = true;

    const key_counts = countDiskKvKeys(db);
    const composerRow = pickLatestComposerRow(db);

    let sample_composer: ParsedBlobSample | null = null;
    let sample_bubble: ParsedBlobSample | null = null;

    if (composerRow) {
      sample_composer = buildComposerSample(composerRow.key, composerRow.value);
      const composerId =
        typeof sample_composer?.fields_redacted.composerId === "string"
          ? sample_composer.fields_redacted.composerId
          : composerRow.key.replace(/^composerData:/, "");
      const bubbleRow = pickBubbleForComposer(db, composerId, true);
      if (bubbleRow) {
        sample_bubble = buildBubbleSample(bubbleRow.key, bubbleRow.value);
      }
    }

    const shape_matches_observed = Boolean(
      sample_composer?.shape.matches_observed && sample_bubble?.shape.matches_observed
    );
    const shape_matches_doc_example = Boolean(
      sample_composer?.shape.matches_doc_example && sample_bubble?.shape.matches_doc_example
    );

    return {
      ...base,
      key_counts,
      sample_composer,
      sample_bubble,
      shape_matches_observed,
      shape_matches_doc_example,
      ingest_scope_note: diskKvIngestScopeNote(shape_matches_observed, shape_matches_doc_example),
      error:
        key_counts.composer_data === 0
          ? "no composerData keys"
          : sample_composer === null
            ? "could not parse composerData sample"
            : sample_bubble === null
              ? "no bubbleId sample for composer"
              : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      key_counts: null,
      sample_composer: null,
      sample_bubble: null,
      error: msg,
      ingest_scope_note: diskKvIngestScopeNote(false, false),
    };
  } finally {
    db?.close();
  }
}
