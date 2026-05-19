/**
 * Consolidated SQLite reader + ingest mapper copied from `@db90/cursor`'s internal
 * `cursor-reader.ts` and `mapper.ts`. Not imported from the package — public export is `./sync`.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import Database from "better-sqlite3";
import type { IngestPayload } from "@db90/sdk";

// ─── Reader: paths & SQLite ──────────────────────────────────────────────────

export function cursorUserDir(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Cursor", "User");
    case "win32":
      return join(process.env.APPDATA ?? homedir(), "Cursor", "User");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Cursor", "User");
  }
}

interface TableInfo {
  name: string;
}

const LEGACY_TABLE = "CursorRequestFeedback";
const STATE_TABLE = "ItemTable";

function getTableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as TableInfo[]
  ).map((r) => r.name);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as TableInfo | undefined;
  return row !== undefined;
}

function logDbTables(db: Database.Database, dbPath: string, label: string): void {
  const tables = getTableNames(db);
  console.log(`  [${label}] ${dbPath}`);
  console.log(`  tables: ${tables.join(", ") || "(none)"}`);
}

// ─── Legacy: cursor.db / CursorRequestFeedback ─────────────────────────────────

export function findCursorDbs(baseDir?: string): string[] {
  const dir = join(baseDir ?? cursorUserDir(), "workspaceStorage");
  try {
    return glob.sync(join(dir, "**", "cursor.db"));
  } catch {
    return [];
  }
}

export interface CursorRow {
  requestId?: string | null;
  timestamp?: number | string | null;
  model?: string | null;
  promptTokens?: number | null;
  generatedTokens?: number | null;
  type?: number | null;
  sessionId?: string | null;
  [key: string]: unknown;
}

function readLegacyFromDb(
  dbPath: string,
  since: Date | null,
  workspacePath: string,
  verbose: boolean
): CursorRow[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    if (verbose) logDbTables(db, dbPath, "cursor.db");

    if (!tableExists(db, LEGACY_TABLE)) return [];

    const params: unknown[] = [workspacePath];
    let query = `SELECT *, ? as _workspacePath FROM ${LEGACY_TABLE}`;
    if (since != null) {
      query += " WHERE timestamp > ?";
      params.push(since.getTime() / 1000 - 1);
    }
    query += " ORDER BY timestamp ASC";

    const rows = db.prepare(query).all(...params) as CursorRow[];

    if (since != null) {
      const sinceMs = since.getTime();
      return rows.filter((row) => {
        const ms = toEpochMs(row.timestamp);
        return ms !== null && ms > sinceMs;
      });
    }
    return rows;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function readLegacyEvents(
  since: Date | null,
  baseDir?: string,
  verbose = false
): Array<{ row: CursorRow; workspacePath: string }> {
  const dbPaths = findCursorDbs(baseDir);

  if (verbose) console.log(`Found ${dbPaths.length} legacy cursor.db file(s)`);

  const results: Array<{ row: CursorRow; workspacePath: string }> = [];
  for (const dbPath of dbPaths) {
    const workspacePath = dbPath.replace(/[\\/]cursor\.db$/, "");
    for (const row of readLegacyFromDb(dbPath, since, workspacePath, verbose)) {
      results.push({ row, workspacePath });
    }
  }
  return results;
}

// ─── state.vscdb / ItemTable / aiCodeTracking keys ─────────────────────────────

export interface DailyStatsEntry {
  date: string;
  value: unknown;
  dbPath: string;
}

export function findStateVscDbs(baseDir?: string): string[] {
  const userDir = baseDir ?? cursorUserDir();
  const results: string[] = [];

  results.push(join(userDir, "globalStorage", "state.vscdb"));

  try {
    results.push(...glob.sync(join(userDir, "workspaceStorage", "**", "state.vscdb")));
  } catch {
    /* ignore */
  }

  return results;
}

function readDailyStatsFromDb(
  dbPath: string,
  since: Date | null,
  verbose: boolean
): DailyStatsEntry[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    if (verbose) logDbTables(db, dbPath, "state.vscdb");

    if (!tableExists(db, STATE_TABLE)) return [];

    const rows = db
      .prepare(`SELECT key, value FROM ${STATE_TABLE} WHERE key LIKE 'aiCodeTracking.%'`)
      .all() as { key: string; value: string }[];

    if (verbose && rows.length > 0) {
      console.log(`  aiCodeTracking keys (${rows.length}):`);
      for (const r of rows.slice(0, 10)) {
        console.log(`    ${r.key} → ${r.value}`);
      }
      if (rows.length > 10) console.log(`    … and ${rows.length - 10} more`);
    }

    const entries: DailyStatsEntry[] = [];
    for (const { key, value: rawValue } of rows) {
      const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})$/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      if (since && date <= since.toISOString().slice(0, 10)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        continue;
      }

      entries.push({ date, value: parsed, dbPath });
    }

    return entries;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function readDailyStats(
  since: Date | null,
  baseDir?: string,
  verbose = false
): DailyStatsEntry[] {
  const dbPaths = findStateVscDbs(baseDir);

  if (verbose) {
    console.log(`Searching: ${baseDir ?? cursorUserDir()}`);
    console.log(`Found ${dbPaths.length} state.vscdb file(s)`);
  }

  const results: DailyStatsEntry[] = [];
  for (const dbPath of dbPaths) {
    results.push(...readDailyStatsFromDb(dbPath, since, verbose));
  }
  return results;
}

// ─── recentCommit ────────────────────────────────────────────────────────────

const RECENT_COMMIT_KEY = "aiCodeTracking.recentCommit";

export interface RecentCommitSnapshot {
  value: Record<string, unknown>;
  dbPath: string;
}

function toTimestampMs(raw: unknown): number | null {
  if (typeof raw === "number" && !isNaN(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function dedupeRecentCommitSnapshots(entries: RecentCommitSnapshot[]): RecentCommitSnapshot[] {
  const byKey = new Map<string, RecentCommitSnapshot>();
  for (const e of entries) {
    const h =
      typeof e.value.commitHash === "string" && e.value.commitHash.length > 0
        ? e.value.commitHash
        : `${e.dbPath}:${String(e.value.timestamp ?? "")}`;
    const prev = byKey.get(h);
    const tE = toTimestampMs(e.value.timestamp);
    if (tE === null) continue;
    if (!prev) {
      byKey.set(h, e);
      continue;
    }
    const tP = toTimestampMs(prev.value.timestamp);
    if (tP === null || tE > tP) byKey.set(h, e);
  }
  return [...byKey.values()];
}

function readRecentCommitFromDb(
  dbPath: string,
  since: Date | null,
  verbose: boolean
): RecentCommitSnapshot[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    if (!tableExists(db, STATE_TABLE)) return [];

    const row = db
      .prepare(`SELECT value FROM ${STATE_TABLE} WHERE key = ?`)
      .get(RECENT_COMMIT_KEY) as { value: string } | undefined;
    if (!row) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      return [];
    }
    if (typeof parsed !== "object" || parsed === null) return [];
    const obj = parsed as Record<string, unknown>;
    const tMs = toTimestampMs(obj.timestamp);
    if (tMs === null) return [];

    if (since !== null) {
      const sinceMs = since.getTime();
      if (tMs <= sinceMs) return [];
    }

    if (verbose) {
      const ch = typeof obj.commitHash === "string" ? obj.commitHash : "";
      console.log(`  [recentCommit] ${dbPath}`);
      if (ch) console.log(`    commitHash → ${ch.slice(0, 12)}…`);
    }

    return [{ value: obj, dbPath }];
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function readRecentCommitSnapshots(
  since: Date | null,
  baseDir?: string,
  verbose = false
): RecentCommitSnapshot[] {
  const dbPaths = findStateVscDbs(baseDir);
  if (verbose) {
    console.log(`Searching recentCommit: ${baseDir ?? cursorUserDir()}`);
  }

  const found: RecentCommitSnapshot[] = [];
  for (const dbPath of dbPaths) {
    found.push(...readRecentCommitFromDb(dbPath, since, verbose));
  }
  return dedupeRecentCommitSnapshots(found);
}

export function readEvents(
  since: Date | null,
  baseDir?: string,
  verbose = false
): Array<{ row: CursorRow; workspacePath: string }> {
  return readLegacyEvents(since, baseDir, verbose);
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

const COST_MODEL = "estimated_line_count" as const;

export interface PricingConfig {
  tokens_per_line: number;
  completion_output_per_mtok: number;
  chat_input_per_mtok: number;
  chat_output_per_mtok: number;
}

export const DEFAULT_CURSOR_PRICING: PricingConfig = {
  tokens_per_line: 15,
  completion_output_per_mtok: 0.6,
  chat_input_per_mtok: 3.0,
  chat_output_per_mtok: 15.0,
};

export type Db90CursorPayloadMetadata = {
  cursor_session_id: string | null;
  workspace: string;
  cost_model: typeof COST_MODEL;
  scannable: false;
  risk_level: "none";
  source?: "recent_commit";
  commit_hash?: string;
  commit_message?: string;
  repo_name?: string;
  branch_name?: string;
  ai_percentage?: number;
};

export interface CursorDb90Payload extends IngestPayload {
  tool_name: "cursor";
  event_type: "completion" | "chat";
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  occurred_at: string;
  project_id?: string;
  metadata: Db90CursorPayloadMetadata;
}

const EPOCH_SECONDS_THRESHOLD = 1e12;

export function toEpochMs(timestamp: number | string | null | undefined): number | null {
  if (timestamp == null) return null;
  const num = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(num)) return null;
  return num < EPOCH_SECONDS_THRESHOLD ? num * 1000 : num;
}

function toIsoString(timestamp: number | string | null | undefined): string | null {
  const ms = toEpochMs(timestamp);
  if (ms === null) return null;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

const nn = (n: number): number => (n > 0 ? n : 0);

function computeLineCost(eventType: "completion" | "chat", lines: number, pricing: PricingConfig): number {
  const safeLines = Math.max(0, lines);
  const tokensPerLine = nn(pricing.tokens_per_line);
  if (eventType === "completion") {
    return (safeLines * tokensPerLine * nn(pricing.completion_output_per_mtok)) / 1_000_000;
  }
  return (
    (safeLines * tokensPerLine * (nn(pricing.chat_output_per_mtok) + nn(pricing.chat_input_per_mtok) * 2)) /
    1_000_000
  );
}

function computeTokenCost(
  eventType: "completion" | "chat",
  tokensIn: number,
  tokensOut: number,
  pricing: PricingConfig
): number {
  const safeIn = Math.max(0, tokensIn);
  const safeOut = Math.max(0, tokensOut);
  if (eventType === "completion") {
    return (safeOut * nn(pricing.completion_output_per_mtok)) / 1_000_000;
  }
  return (safeIn * nn(pricing.chat_input_per_mtok) + safeOut * nn(pricing.chat_output_per_mtok)) / 1_000_000;
}

function pick(obj: unknown, ...keys: string[]): number | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

function buildPayload(opts: {
  eventType: "completion" | "chat";
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  occurredAt: string;
  dbPath: string;
  model?: string;
  projectId?: string;
}): CursorDb90Payload {
  const { eventType, tokensIn, tokensOut, costUsd, occurredAt, dbPath, model = "unknown", projectId } = opts;
  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    occurred_at: occurredAt,
    metadata: { cursor_session_id: null, workspace: dbPath, cost_model: COST_MODEL, scannable: false, risk_level: "none" },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

export function mapDailyStats(
  entry: DailyStatsEntry,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING
): CursorDb90Payload[] {
  const { date, value, dbPath } = entry;
  const occurredAt = `${date}T00:00:00.000Z`;
  const results: CursorDb90Payload[] = [];

  if (typeof value !== "object" || value === null) return results;

  const obj = value as Record<string, unknown>;

  const tabSuggested = pick(obj, "tabSuggestedLines") ?? 0;
  const tabAccepted = pick(obj, "tabAcceptedLines") ?? 0;
  const composerSuggested = pick(obj, "composerSuggestedLines") ?? 0;
  const composerAccepted = pick(obj, "composerAcceptedLines") ?? 0;

  if (tabSuggested > 0 || tabAccepted > 0) {
    results.push(
      buildPayload({
        eventType: "completion",
        tokensIn: tabSuggested,
        tokensOut: tabAccepted,
        costUsd: computeLineCost("completion", tabSuggested, pricing),
        occurredAt,
        dbPath,
        projectId,
      })
    );
  }

  if (composerSuggested > 0 || composerAccepted > 0) {
    results.push(
      buildPayload({
        eventType: "chat",
        tokensIn: composerSuggested,
        tokensOut: composerAccepted,
        costUsd: computeLineCost("chat", composerSuggested, pricing),
        occurredAt,
        dbPath,
        projectId,
      })
    );
  }

  if (results.length > 0) return results;

  const KNOWN_NON_MODEL_KEYS = new Set(["tab", "composer", "chat", "date", "inputTokens", "outputTokens"]);
  for (const [model, stats] of Object.entries(obj)) {
    if (KNOWN_NON_MODEL_KEYS.has(model) || typeof stats !== "object" || stats === null) continue;
    const tokensIn = pick(stats, "inputTokens") ?? pick(stats, "promptTokens") ?? 0;
    const tokensOut = pick(stats, "outputTokens") ?? pick(stats, "generatedTokens") ?? 0;
    if (tokensIn === 0 && tokensOut === 0) continue;
    results.push(
      buildPayload({
        eventType: "chat",
        tokensIn,
        tokensOut,
        costUsd: computeTokenCost("chat", tokensIn, tokensOut, pricing),
        occurredAt,
        dbPath,
        model,
        projectId,
      })
    );
  }

  return results;
}

export function mapRecentCommit(
  entry: RecentCommitSnapshot,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING
): CursorDb90Payload | null {
  const { value: obj, dbPath } = entry;
  const occurredAt = toIsoString(obj.timestamp as number | string | null | undefined);
  if (!occurredAt) return null;

  const la = Number(obj.linesAdded) || 0;
  const ld = Number(obj.linesDeleted) || 0;
  const tla = Number(obj.tabLinesAdded) || 0;
  const tld = Number(obj.tabLinesDeleted) || 0;
  const cla = Number(obj.composerLinesAdded) || 0;
  const cld = Number(obj.composerLinesDeleted) || 0;
  const linesAddedProxy = la + tla + cla;
  const linesDeletedProxy = ld + tld + cld;
  if (linesAddedProxy === 0 && linesDeletedProxy === 0) return null;
  const lineForCost = linesAddedProxy + linesDeletedProxy;
  const costUsd = computeLineCost("chat", Math.max(lineForCost, 0), pricing);

  const commitHash = obj.commitHash;
  const commitMessage = obj.commitMessage;
  const repoName = obj.repoName;
  const branchName = obj.branchName;
  const aiPct = obj.aiPercentage;

  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: "chat",
    model: "unknown",
    tokens_in: linesAddedProxy,
    tokens_out: linesDeletedProxy,
    cost_usd: costUsd,
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: null,
      workspace: dbPath,
      cost_model: COST_MODEL,
      source: "recent_commit",
      commit_hash: typeof commitHash === "string" ? commitHash : undefined,
      commit_message: typeof commitMessage === "string" ? commitMessage : undefined,
      repo_name: typeof repoName === "string" ? repoName : undefined,
      branch_name: typeof branchName === "string" ? branchName : undefined,
      ai_percentage:
        typeof aiPct === "number"
          ? aiPct
          : typeof aiPct === "string"
            ? parseFloat(aiPct) || undefined
            : undefined,
      scannable: false,
      risk_level: "none",
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

export function mapEvent(
  row: CursorRow,
  workspacePath: string,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING
): CursorDb90Payload | null {
  const occurredAt = toIsoString(row.timestamp);
  if (!occurredAt) return null;

  const model = row.model;
  if (!model) return null;

  const eventType: "completion" | "chat" = row.type === 1 ? "chat" : "completion";
  const tokensIn = row.promptTokens ?? 0;
  const tokensOut = row.generatedTokens ?? 0;

  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: computeTokenCost(eventType, tokensIn, tokensOut, pricing),
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: row.sessionId ?? row.requestId ?? null,
      workspace: workspacePath,
      cost_model: COST_MODEL,
      scannable: false,
      risk_level: "none",
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}
