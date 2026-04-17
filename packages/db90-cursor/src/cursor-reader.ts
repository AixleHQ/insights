import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import Database from "better-sqlite3";
import { toEpochMs } from "./mapper.js";
import type { CursorRow } from "./mapper.js";

// ─── Platform-aware paths ────────────────────────────────────────────────────

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

    if (verbose) {
      const tables = getTableNames(db);
      console.log(`  [cursor.db] ${dbPath}`);
      console.log(`  tables: ${tables.join(", ") || "(none)"}`);
    }

    if (!tableExists(db, "CursorRequestFeedback")) return [];

    const params: unknown[] = [workspacePath];
    let query = "SELECT *, ? as _workspacePath FROM CursorRequestFeedback";
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

// ─── Current: state.vscdb / ItemTable / aiCodeTracking keys ──────────────────

export interface DailyStatsEntry {
  /** YYYY-MM-DD from the ItemTable key */
  date: string;
  /** Raw parsed JSON value — shape varies by Cursor version */
  value: unknown;
  /** Path to the state.vscdb file this entry came from */
  dbPath: string;
}

export function findStateVscDbs(baseDir?: string): string[] {
  const userDir = baseDir ?? cursorUserDir();
  const results: string[] = [];

  // Global storage — aggregate stats across all workspaces
  const globalDb = join(userDir, "globalStorage", "state.vscdb");
  if (existsSync(globalDb)) results.push(globalDb);

  // Per-workspace storage
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

    if (verbose) {
      const tables = getTableNames(db);
      console.log(`  [state.vscdb] ${dbPath}`);
      console.log(`  tables: ${tables.join(", ") || "(none)"}`);
    }

    if (!tableExists(db, "ItemTable")) return [];

    const rows = db
      .prepare("SELECT key, value FROM ItemTable WHERE key LIKE 'aiCodeTracking.%'")
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

// ─── Unified entry point (tries both schemas) ─────────────────────────────────

export function readEvents(
  since: Date | null,
  baseDir?: string,
  verbose = false
): Array<{ row: CursorRow; workspacePath: string }> {
  return readLegacyEvents(since, baseDir, verbose);
}
