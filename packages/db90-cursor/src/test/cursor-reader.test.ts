import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  findCursorDbs,
  findStateVscDbs,
  readLegacyEvents,
  readDailyStats,
  readEvents,
} from "../cursor-reader.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "db90-cursor-reader-test-"));
}

function createLegacyDb(dbPath: string, rows: object[]): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE CursorRequestFeedback (
      requestId TEXT,
      timestamp REAL,
      model TEXT,
      promptTokens INTEGER,
      generatedTokens INTEGER,
      type INTEGER,
      sessionId TEXT
    )
  `);
  const insert = db.prepare(
    "INSERT INTO CursorRequestFeedback (requestId, timestamp, model, promptTokens, generatedTokens, type, sessionId) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const row of rows as Array<{
    requestId: string; timestamp: number; model: string;
    promptTokens: number; generatedTokens: number; type: number; sessionId: string | null;
  }>) {
    insert.run(row.requestId, row.timestamp, row.model, row.promptTokens, row.generatedTokens, row.type, row.sessionId);
  }
  db.close();
}

function createItemTableDb(dbPath: string, entries: Array<{ key: string; value: string }>): void {
  const db = new Database(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
  for (const { key, value } of entries) {
    insert.run(key, value);
  }
  db.close();
}

function createEmptyDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.close();
}

// ─── findCursorDbs ────────────────────────────────────────────────────────────

describe("findCursorDbs", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("returns empty array when workspaceStorage does not exist", () => {
    expect(findCursorDbs(tempDir)).toEqual([]);
  });

  it("finds cursor.db files under workspaceStorage", () => {
    const wsDir = join(tempDir, "workspaceStorage", "abc123");
    mkdirSync(wsDir, { recursive: true });
    createEmptyDb(join(wsDir, "cursor.db"));

    const results = findCursorDbs(tempDir);
    expect(results).toHaveLength(1);
    expect(results[0]).toContain("cursor.db");
  });

  it("finds multiple cursor.db files across workspaces", () => {
    for (const id of ["ws1", "ws2", "ws3"]) {
      const dir = join(tempDir, "workspaceStorage", id);
      mkdirSync(dir, { recursive: true });
      createEmptyDb(join(dir, "cursor.db"));
    }
    expect(findCursorDbs(tempDir)).toHaveLength(3);
  });

  it("does not match non-cursor.db files", () => {
    const wsDir = join(tempDir, "workspaceStorage", "abc");
    mkdirSync(wsDir, { recursive: true });
    createEmptyDb(join(wsDir, "state.vscdb"));

    expect(findCursorDbs(tempDir)).toHaveLength(0);
  });
});

// ─── findStateVscDbs ──────────────────────────────────────────────────────────

describe("findStateVscDbs", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("always includes globalStorage/state.vscdb path (even if file missing)", () => {
    const results = findStateVscDbs(tempDir);
    expect(results.some((p) => p.includes("globalStorage"))).toBe(true);
  });

  it("finds state.vscdb files under workspaceStorage", () => {
    const wsDir = join(tempDir, "workspaceStorage", "abc");
    mkdirSync(wsDir, { recursive: true });
    createEmptyDb(join(wsDir, "state.vscdb"));

    const results = findStateVscDbs(tempDir);
    expect(results.some((p) => p.includes("workspaceStorage"))).toBe(true);
  });

  it("finds multiple state.vscdb files across workspaces", () => {
    for (const id of ["ws1", "ws2"]) {
      const dir = join(tempDir, "workspaceStorage", id);
      mkdirSync(dir, { recursive: true });
      createEmptyDb(join(dir, "state.vscdb"));
    }
    // +1 for the always-included globalStorage path
    expect(findStateVscDbs(tempDir).length).toBeGreaterThanOrEqual(2);
  });
});

// ─── readLegacyEvents ─────────────────────────────────────────────────────────

describe("readLegacyEvents", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  function makeWsDb(wsId: string, rows: object[]): string {
    const dir = join(tempDir, "workspaceStorage", wsId);
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, "cursor.db");
    createLegacyDb(dbPath, rows);
    return dbPath;
  }

  it("returns empty array when no cursor.db files exist", () => {
    expect(readLegacyEvents(null, tempDir)).toEqual([]);
  });

  it("returns all rows when since is null", () => {
    makeWsDb("ws1", [
      { requestId: "r1", timestamp: 1700000000000, model: "gpt-4", promptTokens: 100, generatedTokens: 50, type: 0, sessionId: "s1" },
      { requestId: "r2", timestamp: 1700000001000, model: "gpt-4", promptTokens: 200, generatedTokens: 80, type: 1, sessionId: null },
    ]);

    const results = readLegacyEvents(null, tempDir);
    expect(results).toHaveLength(2);
  });

  it("filters rows by since date", () => {
    makeWsDb("ws1", [
      { requestId: "r1", timestamp: 1700000000000, model: "gpt-4", promptTokens: 10, generatedTokens: 5, type: 0, sessionId: null },
      { requestId: "r2", timestamp: 1700100000000, model: "gpt-4", promptTokens: 20, generatedTokens: 10, type: 0, sessionId: null },
    ]);

    const since = new Date(1700000000000); // exactly equal to r1 — should exclude it
    const results = readLegacyEvents(since, tempDir);
    expect(results).toHaveLength(1);
    expect(results[0].row.requestId).toBe("r2");
  });

  it("returns rows from multiple workspace DBs", () => {
    makeWsDb("ws1", [
      { requestId: "r1", timestamp: 1700000000000, model: "gpt-4", promptTokens: 10, generatedTokens: 5, type: 0, sessionId: null },
    ]);
    makeWsDb("ws2", [
      { requestId: "r2", timestamp: 1700000001000, model: "gpt-4", promptTokens: 20, generatedTokens: 10, type: 0, sessionId: null },
    ]);

    expect(readLegacyEvents(null, tempDir)).toHaveLength(2);
  });

  it("handles DB with no CursorRequestFeedback table gracefully", () => {
    const dir = join(tempDir, "workspaceStorage", "ws1");
    mkdirSync(dir, { recursive: true });
    createEmptyDb(join(dir, "cursor.db")); // no tables

    expect(readLegacyEvents(null, tempDir)).toEqual([]);
  });

  it("includes workspacePath derived from DB path", () => {
    makeWsDb("ws1", [
      { requestId: "r1", timestamp: 1700000000000, model: "gpt-4", promptTokens: 10, generatedTokens: 5, type: 0, sessionId: null },
    ]);

    const results = readLegacyEvents(null, tempDir);
    expect(results[0].workspacePath).not.toContain("cursor.db");
    expect(results[0].workspacePath).toContain("ws1");
  });
});

// ─── readDailyStats ───────────────────────────────────────────────────────────

describe("readDailyStats", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  function makeGlobalDb(entries: Array<{ key: string; value: string }>): void {
    const dir = join(tempDir, "globalStorage");
    mkdirSync(dir, { recursive: true });
    createItemTableDb(join(dir, "state.vscdb"), entries);
  }

  it("returns empty array when no state.vscdb files have aiCodeTracking keys", () => {
    makeGlobalDb([{ key: "other.key", value: "ignored" }]);
    expect(readDailyStats(null, tempDir)).toEqual([]);
  });

  it("parses aiCodeTracking daily stats entries", () => {
    makeGlobalDb([
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-02-09",
        value: JSON.stringify({ tabSuggestedLines: 6, tabAcceptedLines: 2 }),
      },
    ]);

    const results = readDailyStats(null, tempDir);
    expect(results).toHaveLength(1);
    expect(results[0].date).toBe("2026-02-09");
    expect((results[0].value as Record<string, number>).tabSuggestedLines).toBe(6);
  });

  it("filters entries on or before since date", () => {
    makeGlobalDb([
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-01-01",
        value: JSON.stringify({ tabSuggestedLines: 5 }),
      },
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-03-01",
        value: JSON.stringify({ tabSuggestedLines: 10 }),
      },
    ]);

    const since = new Date("2026-01-15");
    const results = readDailyStats(since, tempDir);
    expect(results).toHaveLength(1);
    expect(results[0].date).toBe("2026-03-01");
  });

  it("skips keys with invalid JSON values", () => {
    makeGlobalDb([
      { key: "aiCodeTracking.dailyStats.v1.5.2026-02-09", value: "not-json" },
    ]);
    expect(readDailyStats(null, tempDir)).toHaveLength(0);
  });

  it("skips keys without a date suffix", () => {
    makeGlobalDb([
      { key: "aiCodeTracking.someOtherKey", value: "{}" },
    ]);
    expect(readDailyStats(null, tempDir)).toHaveLength(0);
  });

  it("handles DB with no ItemTable gracefully", () => {
    const dir = join(tempDir, "globalStorage");
    mkdirSync(dir, { recursive: true });
    createEmptyDb(join(dir, "state.vscdb")); // no tables

    expect(readDailyStats(null, tempDir)).toHaveLength(0);
  });

  it("aggregates entries from multiple state.vscdb files", () => {
    makeGlobalDb([
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-02-09",
        value: JSON.stringify({ tabSuggestedLines: 6 }),
      },
    ]);

    const wsDir = join(tempDir, "workspaceStorage", "ws1");
    mkdirSync(wsDir, { recursive: true });
    createItemTableDb(join(wsDir, "state.vscdb"), [
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-03-01",
        value: JSON.stringify({ composerSuggestedLines: 10 }),
      },
    ]);

    const results = readDailyStats(null, tempDir);
    expect(results).toHaveLength(2);
  });
});

// ─── readEvents (delegates to readLegacyEvents) ───────────────────────────────

describe("readEvents", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("returns legacy events (delegates to readLegacyEvents)", () => {
    const wsDir = join(tempDir, "workspaceStorage", "ws1");
    mkdirSync(wsDir, { recursive: true });
    createLegacyDb(join(wsDir, "cursor.db"), [
      { requestId: "r1", timestamp: 1700000000000, model: "gpt-4", promptTokens: 10, generatedTokens: 5, type: 0, sessionId: null },
    ]);

    const results = readEvents(null, tempDir);
    expect(results).toHaveLength(1);
    expect(results[0].row.requestId).toBe("r1");
  });
});
