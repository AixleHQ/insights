import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import Database from "better-sqlite3";
import { toEpochMs } from "./mapper.js";
import type { CursorRow } from "./mapper.js";

function cursorUserDir(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Cursor", "User");
    case "win32":
      return join(process.env.APPDATA ?? homedir(), "Cursor", "User");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Cursor", "User");
  }
}

// ─── Shared SQLite helpers ────────────────────────────────────────────────────

interface TableInfo { name: string; }

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

let sqliteReadFailureBannerShown = false;

function logSqliteReadFailure(dbPath: string, err: unknown, verbose: boolean): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (verbose) {
    console.warn(`  [sqlite] Could not read ${dbPath}: ${msg}`);
    return;
  }
  if (!sqliteReadFailureBannerShown) {
    sqliteReadFailureBannerShown = true;
    console.warn(
      `[db90-cursor] Could not read Cursor SQLite (${msg}). Try closing Cursor or: cd packages/tools && npm rebuild better-sqlite3`
    );
  }
}

/** @internal test helper */
export function resetSqliteReadFailureBannerForTests(): void {
  sqliteReadFailureBannerShown = false;
}

/** Quick health check for better-sqlite3 + global state.vscdb (used by verify:dry-run-matrix). */
export function probeCursorGlobalStateDb(verbose = false): boolean {
  const dbPath = join(cursorUserDir(), "globalStorage", "state.vscdb");
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(
        `SELECT count(*) AS c FROM ${STATE_TABLE} WHERE key LIKE 'aiCodeTracking.dailyStats%'`
      )
      .get() as { c: number };
    db.close();
    if (verbose) {
      console.log(`  [probe] global state.vscdb OK — ${row.c} dailyStats key(s)`);
    }
    return true;
  } catch (err) {
    logSqliteReadFailure(dbPath, err, true);
    return false;
  }
}

// ─── Legacy: cursor.db / CursorRequestFeedback ───────────────────────────────

export function findCursorDbs(baseDir?: string): string[] {
  const dir = join(baseDir ?? cursorUserDir(), "workspaceStorage");
  try {
    return glob.sync(join(dir, "**", "cursor.db"));
  } catch {
    return [];
  }
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
      // SQL uses a 1-second looser bound because Cursor timestamps can be stored
      // as seconds or milliseconds. The in-memory filter below is authoritative.
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
  } catch (err) {
    logSqliteReadFailure(dbPath, err, verbose);
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

// ─── Current: state.vscdb / ItemTable / aiCodeTracking keys ──────────────────

export interface DailyStatsEntry {
  /** YYYY-MM-DD from the ItemTable key */
  date: string;
  /** Raw parsed JSON value — shape varies by Cursor version */
  value: unknown;
  /** Path to the state.vscdb file this entry came from */
  dbPath: string;
}

import { isGlobalStateDbPath } from "./workspace-metadata.js";

export { isGlobalStateDbPath } from "./workspace-metadata.js";

function dailyStatsActivityTotal(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const o = value as Record<string, unknown>;
  const fields = [
    "tabSuggestedLines",
    "tabAcceptedLines",
    "composerSuggestedLines",
    "composerAcceptedLines",
  ] as const;
  return fields.reduce((sum, field) => {
    const n = o[field];
    return sum + (typeof n === "number" && n > 0 ? n : 0);
  }, 0);
}

function dailyStatsValuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Collapse duplicate `dailyStats` rows for the same calendar day across multiple
 * `state.vscdb` files. Cursor writes install-wide rollups to globalStorage; workspace
 * copies for the same date are skipped when global is present (CUR-V06).
 */
export function dedupeDailyStatsEntries(entries: DailyStatsEntry[]): DailyStatsEntry[] {
  const byDate = new Map<string, DailyStatsEntry[]>();
  for (const entry of entries) {
    const group = byDate.get(entry.date) ?? [];
    group.push(entry);
    byDate.set(entry.date, group);
  }

  const deduped: DailyStatsEntry[] = [];

  for (const group of byDate.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const fromGlobal = group.filter((e) => isGlobalStateDbPath(e.dbPath));
    if (fromGlobal.length > 0) {
      deduped.push(fromGlobal[0]);
      continue;
    }

    // Workspace-only: drop identical JSON blobs, then keep the busiest row.
    const distinct: DailyStatsEntry[] = [];
    for (const entry of group) {
      if (distinct.some((d) => dailyStatsValuesEqual(d.value, entry.value))) continue;
      distinct.push(entry);
    }
    if (distinct.length === 1) {
      deduped.push(distinct[0]);
      continue;
    }
    distinct.sort(
      (a, b) => dailyStatsActivityTotal(b.value) - dailyStatsActivityTotal(a.value)
    );
    deduped.push(distinct[0]);
  }

  return deduped.sort((a, b) => a.date.localeCompare(b.date));
}

export function findStateVscDbs(baseDir?: string): string[] {
  const userDir = baseDir ?? cursorUserDir();
  const results: string[] = [];

  // Global storage holds aggregate stats across all workspaces — check first.
  results.push(join(userDir, "globalStorage", "state.vscdb"));

  try {
    results.push(
      ...glob.sync(join(userDir, "workspaceStorage", "**", "state.vscdb"))
    );
  } catch { /* ignore */ }

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
      // Keys like: aiCodeTracking.dailyStats.v1.5.2024-01-15
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
  } catch (err) {
    logSqliteReadFailure(dbPath, err, verbose);
    return [];
  } finally {
    db?.close();
  }
}

function readDailyStatsRaw(
  since: Date | null,
  baseDir: string | undefined,
  verbose: boolean
): DailyStatsEntry[] {
  const dbPaths = findStateVscDbs(baseDir);

  if (verbose) {
    console.log(`Searching: ${baseDir ?? cursorUserDir()}`);
    console.log(`Found ${dbPaths.length} state.vscdb file(s)`);
  }

  const raw: DailyStatsEntry[] = [];
  for (const dbPath of dbPaths) {
    raw.push(...readDailyStatsFromDb(dbPath, since, verbose));
  }
  return raw;
}

export interface DailyStatsReadResult {
  raw: DailyStatsEntry[];
  deduped: DailyStatsEntry[];
}

export function readDailyStatsWithDedupe(
  since: Date | null,
  baseDir?: string,
  verbose = false
): DailyStatsReadResult {
  const raw = readDailyStatsRaw(since, baseDir, verbose);
  const deduped = dedupeDailyStatsEntries(raw);
  if (verbose && raw.length !== deduped.length) {
    console.log(
      `  dailyStats dedupe: ${raw.length} raw row(s) → ${deduped.length} after preferring globalStorage per date`
    );
  }
  return { raw, deduped };
}

export function readDailyStats(
  since: Date | null,
  baseDir?: string,
  verbose = false
): DailyStatsEntry[] {
  return readDailyStatsWithDedupe(since, baseDir, verbose).deduped;
}

// ─── Recent commit snapshot: aiCodeTracking.recentCommit (single key, no date in name) ─

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
  } catch (err) {
    logSqliteReadFailure(dbPath, err, verbose);
    return [];
  } finally {
    db?.close();
  }
}

/**
 * Reads Cursor’s `aiCodeTracking.recentCommit` row (latest commit recorded by Cursor, not git history).
 * Multiple `state.vscdb` files are de-duplicated by `commitHash` when present.
 */
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
