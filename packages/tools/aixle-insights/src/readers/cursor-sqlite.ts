import { existsSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import Database from "better-sqlite3";

export type CursorSqliteOpenFailureReason =
  | "missing"
  | "outside_root"
  | "native_binding"
  | "unknown";

export type CursorSqliteOpenResult =
  | { ok: true; db: Database.Database }
  | { ok: false; reason: CursorSqliteOpenFailureReason; message: string };

export interface CursorSqliteOpenOptions {
  rootDir?: string;
}

function isWithinRoot(path: string, rootDir: string): boolean {
  const realPath = realpathSync(path);
  const realRoot = realpathSync(rootDir);
  if (realPath === realRoot) return true;
  const rootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  return realPath.startsWith(rootWithSep);
}

function isNativeBindingError(message: string): boolean {
  return (
    message.includes("Could not locate the bindings file") ||
    message.includes("better_sqlite3.node") ||
    message.includes("dlopen")
  );
}

export function openCursorSqliteReadonly(
  dbPath: string,
  options: CursorSqliteOpenOptions = {}
): CursorSqliteOpenResult {
  const normalizedPath = resolve(dbPath);
  if (!existsSync(normalizedPath)) {
    return {
      ok: false,
      reason: "missing",
      message: `Database file does not exist: ${normalizedPath}`,
    };
  }

  const { rootDir } = options;
  if (rootDir) {
    const normalizedRoot = resolve(rootDir);
    try {
      if (!isWithinRoot(normalizedPath, normalizedRoot)) {
        return {
          ok: false,
          reason: "outside_root",
          message: `Database path escapes root: ${normalizedPath}`,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        reason: "unknown",
        message,
      };
    }
  }

  try {
    const db = new Database(normalizedPath, { readonly: true, fileMustExist: true });
    return { ok: true, db };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: isNativeBindingError(message) ? "native_binding" : "unknown",
      message,
    };
  }
}
