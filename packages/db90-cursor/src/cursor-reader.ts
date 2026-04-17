import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import Database from "better-sqlite3";
import { toEpochMs } from "./mapper.js";
import type { CursorRow } from "./mapper.js";

function defaultCursorDir(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage");
    case "win32":
      return join(process.env.APPDATA ?? homedir(), "Cursor", "User", "workspaceStorage");
    default:
      // Linux / other
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Cursor", "User", "workspaceStorage");
  }
}

export function findCursorDbs(cursorDir?: string): string[] {
  const searchDir = cursorDir ?? defaultCursorDir();
  try {
    return glob.sync(join(searchDir, "**", "cursor.db"));
  } catch {
    return [];
  }
}

interface TableInfo {
  name: string;
}

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

function readEventsFromDb(
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
      console.log(`  ${dbPath}`);
      console.log(`  tables: ${tables.length > 0 ? tables.join(", ") : "(none)"}`);
    }

    if (!tableExists(db, "CursorRequestFeedback")) return [];

    let query: string;
    let params: unknown[];

    if (since != null) {
      // Use the seconds-based bound (always smaller than ms bound) as a
      // generous SQL pre-filter; the JS post-filter below is authoritative.
      const sinceSec = since.getTime() / 1000;
      query =
        "SELECT *, ? as _workspacePath FROM CursorRequestFeedback WHERE timestamp > ? ORDER BY timestamp ASC";
      params = [workspacePath, sinceSec - 1];
    } else {
      query =
        "SELECT *, ? as _workspacePath FROM CursorRequestFeedback ORDER BY timestamp ASC";
      params = [workspacePath];
    }

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

export function readEvents(
  since: Date | null,
  cursorDir?: string,
  verbose = false
): Array<{ row: CursorRow; workspacePath: string }> {
  const searchDir = cursorDir ?? defaultCursorDir();
  const dbPaths = findCursorDbs(cursorDir);

  if (verbose) {
    console.log(`Searching: ${searchDir}`);
    console.log(`Found ${dbPaths.length} cursor.db file(s)`);
  }

  const results: Array<{ row: CursorRow; workspacePath: string }> = [];

  for (const dbPath of dbPaths) {
    const workspacePath = dbPath.replace(/[\\/]cursor\.db$/, "");
    const rows = readEventsFromDb(dbPath, since, workspacePath, verbose);
    for (const row of rows) {
      results.push({ row, workspacePath });
    }
  }

  return results;
}
