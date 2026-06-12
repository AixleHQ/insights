import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openCursorSqliteReadonly } from "../readers/cursor-sqlite.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "db90-cursor-sqlite-test-"));
}

function createItemTableDb(dbPath: string): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "aiCodeTracking.dailyStats.v1.5.2026-06-12",
    JSON.stringify({ tabSuggestedLines: 1, tabAcceptedLines: 1 })
  );
  db.close();
}

describe("openCursorSqliteReadonly", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("opens a readable sqlite database with readonly mode", () => {
    const dbPath = join(tempDir, "workspaceStorage", "ws1", "state.vscdb");
    createItemTableDb(dbPath);

    const result = openCursorSqliteReadonly(dbPath, { rootDir: tempDir });
    expect(result.ok).toBe(true);

    if (!result.ok) return;
    const row = result.db
      .prepare("SELECT count(*) AS c FROM ItemTable")
      .get() as { c: number };
    expect(row.c).toBe(1);
    result.db.close();
  });

  it("returns missing when the file does not exist", () => {
    const dbPath = join(tempDir, "workspaceStorage", "missing", "state.vscdb");
    const result = openCursorSqliteReadonly(dbPath, { rootDir: tempDir });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing");
  });

  it("rejects db paths that escape root through symlink", () => {
    const outsideRoot = makeTempDir();
    try {
      const targetDb = join(outsideRoot, "outside", "state.vscdb");
      createItemTableDb(targetDb);

      const symlinkPath = join(tempDir, "workspaceStorage", "ws1", "state.vscdb");
      mkdirSync(join(symlinkPath, ".."), { recursive: true });
      symlinkSync(targetDb, symlinkPath);

      const result = openCursorSqliteReadonly(symlinkPath, { rootDir: tempDir });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("outside_root");
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("allows symlinked db paths that still resolve within root", () => {
    const targetDb = join(tempDir, "workspaceStorage", "target", "state.vscdb");
    createItemTableDb(targetDb);

    const symlinkPath = join(tempDir, "workspaceStorage", "ws1", "state.vscdb");
    mkdirSync(join(symlinkPath, ".."), { recursive: true });
    symlinkSync(targetDb, symlinkPath);

    const result = openCursorSqliteReadonly(symlinkPath, { rootDir: tempDir });
    expect(result.ok).toBe(true);
    if (result.ok) result.db.close();
  });
});
