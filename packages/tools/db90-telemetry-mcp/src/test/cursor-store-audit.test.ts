import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  auditCursorLocalStores,
  auditLegacyCursorDbFile,
  auditStateVscdbFile,
} from "../cursor-store-audit.js";

function createItemTableDb(dbPath: string, keys: Array<{ key: string; value: string }>): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
  for (const { key, value } of keys) {
    insert.run(key, value);
  }
  db.close();
}

function createLegacyDb(dbPath: string, rowCount: number): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath);
  db.exec(
    "CREATE TABLE CursorRequestFeedback (timestamp INTEGER, model TEXT, promptTokens INTEGER, generatedTokens INTEGER, type INTEGER)"
  );
  const insert = db.prepare(
    "INSERT INTO CursorRequestFeedback (timestamp, model, promptTokens, generatedTokens, type) VALUES (?, ?, ?, ?, ?)"
  );
  for (let i = 0; i < rowCount; i++) {
    insert.run(1_700_000_000 + i, "gpt-4", 10, 20, 1);
  }
  db.close();
}

describe("auditStateVscdbFile", () => {
  it("counts dailyStats keys and recentCommit", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-audit-"));
    const dbPath = join(root, "globalStorage", "state.vscdb");
    createItemTableDb(dbPath, [
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-05-01",
        value: JSON.stringify({ tabSuggestedLines: 1, tabAcceptedLines: 1 }),
      },
      { key: "aiCodeTracking.recentCommit", value: JSON.stringify({ timestamp: 1 }) },
    ]);

    const result = auditStateVscdbFile(dbPath);
    expect(result.exists).toBe(true);
    expect(result.daily_stats_key_count).toBe(1);
    expect(result.has_recent_commit).toBe(true);
  });
});

describe("auditLegacyCursorDbFile", () => {
  it("reports row count when CursorRequestFeedback exists", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-legacy-"));
    const dbPath = join(root, "workspaceStorage", "abc", "cursor.db");
    createLegacyDb(dbPath, 3);

    expect(auditLegacyCursorDbFile(dbPath)).toMatchObject({
      has_feedback_table: true,
      feedback_row_count: 3,
    });
  });

  it("reports zero rows when file has no feedback table", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-empty-legacy-"));
    const dbPath = join(root, "workspaceStorage", "abc", "cursor.db");
    mkdirSync(join(dbPath, ".."), { recursive: true });
    writeFileSync(dbPath, "");

    const db = new Database(dbPath);
    db.exec("CREATE TABLE other (id INTEGER)");
    db.close();

    expect(auditLegacyCursorDbFile(dbPath)).toMatchObject({
      has_feedback_table: false,
      feedback_row_count: 0,
    });
  });
});

describe("auditCursorLocalStores", () => {
  it("returns no_legacy_dbs when only state.vscdb exists", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-audit-full-"));
    const dbPath = join(root, "globalStorage", "state.vscdb");
    createItemTableDb(dbPath, [
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-05-01",
        value: JSON.stringify({ tabSuggestedLines: 1, tabAcceptedLines: 0 }),
      },
    ]);

    const report = auditCursorLocalStores(root);
    expect(report.path_c_verdict).toBe("no_legacy_dbs");
    expect(report.state_vscdb.global.daily_stats_key_count).toBe(1);
    expect(report.daily_stats_versions.buckets.some((b) => b.version === "v1.5")).toBe(true);
  });
});
