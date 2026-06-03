import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  DailyStatsVersionDiscovery,
  discoverDailyStatsVersionsInDb,
  mergeDailyStatsVersionDiscoveries,
} from "./daily-stats-versions.js";
import {
  cursorUserDir,
  findCursorDbs,
  findStateVscDbs,
  isGlobalStateDbPath,
  probeCursorGlobalStateDb,
} from "./readers/cursor.js";

export type { DailyStatsVersionDiscovery } from "./daily-stats-versions.js";

const LEGACY_TABLE = "CursorRequestFeedback";
const STATE_TABLE = "ItemTable";
const RECENT_COMMIT_KEY = "aiCodeTracking.recentCommit";

export type PathCLegacyVerdict = "no_legacy_dbs" | "legacy_present_empty" | "legacy_has_rows";

export interface LegacyDbAuditEntry {
  db_path_redacted: string;
  file_bytes: number;
  has_feedback_table: boolean;
  feedback_row_count: number;
}

export interface StateVscdbAuditEntry {
  db_path_redacted: string;
  exists: boolean;
  daily_stats_key_count: number;
  has_recent_commit: boolean;
}

export interface CursorStoreAuditReport {
  captured_at: string;
  platform: NodeJS.Platform;
  sqlite_probe_ok: boolean;
  state_vscdb: {
    total_paths: number;
    global: StateVscdbAuditEntry;
    workspace_scoped_count: number;
    workspace_with_daily_stats: number;
    workspace_with_recent_commit: number;
  };
  legacy_cursor_db: {
    count: number;
    with_feedback_table: number;
    total_feedback_rows: number;
    entries: LegacyDbAuditEntry[];
  };
  path_c_verdict: PathCLegacyVerdict;
  /** Human-readable summary for CUR-V07 / DATA-CURRENT.md. */
  ingest_note: string;
  /** CUR-V11 — version prefixes under `aiCodeTracking.dailyStats.*` (install-wide). */
  daily_stats_versions: DailyStatsVersionDiscovery;
  /** Short note when v1.6+ or unparsed keys need cursor-6 work. */
  daily_stats_version_note: string;
}

export function redactCursorPath(p: string): string {
  return p.replaceAll(homedir(), "~");
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as { name: string } | undefined;
  return row !== undefined;
}

export function auditStateVscdbFile(dbPath: string): StateVscdbAuditEntry {
  const entry: StateVscdbAuditEntry = {
    db_path_redacted: redactCursorPath(dbPath),
    exists: existsSync(dbPath),
    daily_stats_key_count: 0,
    has_recent_commit: false,
  };
  if (!entry.exists) return entry;

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const ds = db
      .prepare(
        `SELECT count(*) AS c FROM ${STATE_TABLE} WHERE key LIKE 'aiCodeTracking.dailyStats%'`
      )
      .get() as { c: number };
    const rc = db
      .prepare(`SELECT 1 FROM ${STATE_TABLE} WHERE key = ? LIMIT 1`)
      .get(RECENT_COMMIT_KEY);
    entry.daily_stats_key_count = ds.c;
    entry.has_recent_commit = rc !== undefined;
  } catch {
    // Leave counts at zero — caller checks sqlite_probe_ok.
  } finally {
    db?.close();
  }
  return entry;
}

export function auditLegacyCursorDbFile(dbPath: string): LegacyDbAuditEntry {
  const entry: LegacyDbAuditEntry = {
    db_path_redacted: redactCursorPath(dbPath),
    file_bytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
    has_feedback_table: false,
    feedback_row_count: 0,
  };
  if (!existsSync(dbPath)) return entry;

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    if (!tableExists(db, LEGACY_TABLE)) return entry;
    entry.has_feedback_table = true;
    const row = db.prepare(`SELECT count(*) AS c FROM ${LEGACY_TABLE}`).get() as { c: number };
    entry.feedback_row_count = row.c;
  } catch {
    return entry;
  } finally {
    db?.close();
  }
  return entry;
}

function dailyStatsVersionNote(discovery: DailyStatsVersionDiscovery): string {
  if (discovery.buckets.length === 0) {
    return "No aiCodeTracking.dailyStats keys found in any state.vscdb.";
  }
  const versions = discovery.buckets.map((b) => `${b.version} (${b.key_count})`).join(", ");
  if (discovery.has_version_newer_than_v1_5) {
    const extra =
      discovery.unmatched_keys.length > 0
        ? ` Unparsed keys: ${discovery.unmatched_keys.slice(0, 3).join(", ")}${discovery.unmatched_keys.length > 3 ? "…" : ""}.`
        : "";
    return (
      `Found dailyStats version(s): ${versions}. Highest: ${discovery.highest_version}.` +
      " v1.6+ or non-standard keys present — track as cursor-6 (schema discovery / mapper)." +
      extra
    );
  }
  return (
    `Found dailyStats version(s): ${versions}. Highest: ${discovery.highest_version}.` +
    " Reader accepts any v* dated key; no cursor-6 follow-up on this install."
  );
}

function pathCIngestNote(verdict: PathCLegacyVerdict, legacyCount: number, totalRows: number): string {
  switch (verdict) {
    case "no_legacy_dbs":
      return (
        `No workspaceStorage/**/cursor.db files found (${legacyCount} paths). ` +
        "Path C (legacy per-request) contributes zero events on this install; rely on state.vscdb Paths A/B."
      );
    case "legacy_present_empty":
      return (
        `Found ${legacyCount} cursor.db file(s) but CursorRequestFeedback is empty or missing. ` +
        "Path C wired in sync but produces no payloads until/unless Cursor writes legacy rows."
      );
    case "legacy_has_rows":
      return (
        `Found ${legacyCount} cursor.db file(s) with ${totalRows} CursorRequestFeedback row(s). ` +
        "Path C can emit real token counts and model names when synced."
      );
  }
}

/**
 * CUR-V07 — inventory local Cursor stores (state.vscdb vs legacy cursor.db).
 * Does not read disk outside Cursor's User directory unless `baseDir` is passed (tests).
 */
export function auditCursorLocalStores(baseDir?: string): CursorStoreAuditReport {
  const sqlite_probe_ok = probeCursorGlobalStateDb(false);
  const statePaths = findStateVscDbs(baseDir);
  const globalPath =
    statePaths.find((p) => isGlobalStateDbPath(p)) ??
    join(baseDir ?? cursorUserDir(), "globalStorage", "state.vscdb");

  const global = auditStateVscdbFile(globalPath);
  const workspacePaths = statePaths.filter((p) => !isGlobalStateDbPath(p));
  const workspaceAudits = workspacePaths.map(auditStateVscdbFile);

  const versionDiscoveries = statePaths
    .filter((p) => existsSync(p))
    .map(discoverDailyStatsVersionsInDb);
  const daily_stats_versions = mergeDailyStatsVersionDiscoveries(versionDiscoveries);

  const legacyPaths = findCursorDbs(baseDir);
  const legacyEntries = legacyPaths.map(auditLegacyCursorDbFile);
  const withFeedbackTable = legacyEntries.filter((e) => e.has_feedback_table).length;
  const totalFeedbackRows = legacyEntries.reduce((sum, e) => sum + e.feedback_row_count, 0);

  let path_c_verdict: PathCLegacyVerdict;
  if (legacyPaths.length === 0) {
    path_c_verdict = "no_legacy_dbs";
  } else if (totalFeedbackRows === 0) {
    path_c_verdict = "legacy_present_empty";
  } else {
    path_c_verdict = "legacy_has_rows";
  }

  return {
    captured_at: new Date().toISOString(),
    platform: process.platform,
    sqlite_probe_ok,
    state_vscdb: {
      total_paths: statePaths.length,
      global,
      workspace_scoped_count: workspacePaths.length,
      workspace_with_daily_stats: workspaceAudits.filter((e) => e.daily_stats_key_count > 0).length,
      workspace_with_recent_commit: workspaceAudits.filter((e) => e.has_recent_commit).length,
    },
    legacy_cursor_db: {
      count: legacyPaths.length,
      with_feedback_table: withFeedbackTable,
      total_feedback_rows: totalFeedbackRows,
      entries: legacyEntries,
    },
    path_c_verdict,
    ingest_note: pathCIngestNote(path_c_verdict, legacyPaths.length, totalFeedbackRows),
    daily_stats_versions,
    daily_stats_version_note: dailyStatsVersionNote(daily_stats_versions),
  };
}
