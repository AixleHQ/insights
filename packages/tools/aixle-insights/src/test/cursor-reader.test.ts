import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  findCursorDbs,
  findCursorTranscriptFiles,
  findStateVscDbs,
  probeCursorGlobalStateDb,
  parseCursorTranscriptFile,
  readLegacyEvents,
  readCursorTranscriptSessions,
  readDailyStats,
  readEvents,
  readRecentCommitSnapshots,
} from "../readers/cursor.js";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const malformedNotSqliteFixture = join(
  __dirname,
  "fixtures",
  "malformed",
  "not-sqlite.db"
);

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

describe("probeCursorGlobalStateDb", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns true for a readable global state.vscdb with ItemTable", () => {
    const globalDir = join(tempDir, "globalStorage");
    mkdirSync(globalDir, { recursive: true });
    createItemTableDb(join(globalDir, "state.vscdb"), [
      {
        key: "aiCodeTracking.dailyStats.v1.5.2026-06-12",
        value: JSON.stringify({ tabSuggestedLines: 1, tabAcceptedLines: 1 }),
      },
    ]);

    expect(probeCursorGlobalStateDb(false, tempDir)).toBe(true);
  });

  it("returns false when global state.vscdb is missing under baseDir", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(probeCursorGlobalStateDb(false, tempDir)).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("findCursorTranscriptFiles", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("finds agent transcript jsonl files under project directories", () => {
    const transcriptDir = join(tempDir, "repo", "agent-transcripts", "composer-1");
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(join(transcriptDir, "composer-1.jsonl"), "", "utf-8");

    const results = findCursorTranscriptFiles([tempDir]);
    expect(results).toHaveLength(1);
    expect(results[0]).toContain("composer-1.jsonl");
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

  it("returns empty when a discovered cursor.db is malformed", () => {
    const wsDir = join(tempDir, "workspaceStorage", "ws1");
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "cursor.db"), readFileSync(malformedNotSqliteFixture));

    expect(readLegacyEvents(null, tempDir)).toEqual([]);
  });

  it("ignores symlinked cursor.db files that resolve outside baseDir", () => {
    const outsideRoot = makeTempDir();
    try {
      const targetDb = join(outsideRoot, "outside", "cursor.db");
      mkdirSync(join(targetDb, ".."), { recursive: true });
      createLegacyDb(targetDb, [
        {
          requestId: "r1",
          timestamp: 1700000000000,
          model: "gpt-4",
          promptTokens: 10,
          generatedTokens: 5,
          type: 0,
          sessionId: null,
        },
      ]);

      const symlinkPath = join(tempDir, "workspaceStorage", "ws1", "cursor.db");
      mkdirSync(join(symlinkPath, ".."), { recursive: true });
      symlinkSync(targetDb, symlinkPath);

      expect(readLegacyEvents(null, tempDir)).toEqual([]);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
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

// ─── readRecentCommitSnapshots ────────────────────────────────────────────────

describe("readRecentCommitSnapshots", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  function makeGlobalDb(entries: Array<{ key: string; value: string }>): void {
    const dir = join(tempDir, "globalStorage");
    mkdirSync(dir, { recursive: true });
    createItemTableDb(join(dir, "state.vscdb"), entries);
  }

  it("reads aiCodeTracking.recentCommit when present", () => {
    makeGlobalDb([
      {
        key: "aiCodeTracking.recentCommit",
        value: JSON.stringify({
          commitHash: "abc123",
          timestamp: 1704067200000,
          linesAdded: 5,
          linesDeleted: 2,
        }),
      },
    ]);

    const results = readRecentCommitSnapshots(null, tempDir);
    expect(results).toHaveLength(1);
    expect(results[0].value.commitHash).toBe("abc123");
    expect(Number(results[0].value.timestamp)).toBe(1704067200000);
  });

  it("filters rows older than since", () => {
    makeGlobalDb([
      {
        key: "aiCodeTracking.recentCommit",
        value: JSON.stringify({
          commitHash: "abc123",
          timestamp: 1704067200000,
          linesAdded: 5,
        }),
      },
    ]);

    const since = new Date(1704067210000); // after commit
    expect(readRecentCommitSnapshots(since, tempDir)).toHaveLength(0);
  });

  it("returns empty when key is absent", () => {
    makeGlobalDb([{ key: "other.key", value: "{}" }]);
    expect(readRecentCommitSnapshots(null, tempDir)).toHaveLength(0);
  });

  it("returns empty when global state.vscdb is malformed", () => {
    const globalDir = join(tempDir, "globalStorage");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "state.vscdb"), readFileSync(malformedNotSqliteFixture));

    expect(readRecentCommitSnapshots(null, tempDir)).toEqual([]);
  });
});

describe("cursor transcript sessions", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("parses prompt/assistant text from a transcript file", async () => {
    const filePath = join(tempDir, "composer-1.jsonl");
    writeFileSync(
      filePath,
      [
        JSON.stringify({ role: "user", message: { content: [{ type: "text", text: "<user_query>\nInspect the health output\n</user_query>" }] } }),
        JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "Health is green." }, { type: "tool_use", name: "Read" }] } }),
      ].join("\n"),
      "utf-8"
    );

    const result = await parseCursorTranscriptFile(
      filePath,
      new Map([
        [
          "composer-1",
          {
            composerId: "composer-1",
            name: "Health check",
            workspacePath: "/tmp/workspace",
            lastUpdatedAt: "2026-05-20T09:00:00.000Z",
          },
        ],
      ])
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.sessionId).toBe("composer-1");
    expect(result[0]?.turnId).toBe("composer-1:1");
    expect(result[0]?.promptText).toBe("Inspect the health output");
    expect(result[0]?.assistantText).toContain("Health is green.");
    expect(result[0]?.workspacePath).toBe("/tmp/workspace");
    expect(result[0]?.composerName).toBe("Health check");
    expect(result[0]?.occurredAt).toBe("2026-05-20T09:00:00.000Z");
    expect(result[0]?.tokensIn).toBeGreaterThan(0);
    expect(result[0]?.tokensOut).toBeGreaterThan(0);
  });

  it("splits multiple user prompts into separate turns", async () => {
    const filePath = join(tempDir, "composer-multi.jsonl");
    writeFileSync(
      filePath,
      [
        JSON.stringify({ role: "user", message: { content: [{ type: "text", text: "<user_query>\nFirst question\n</user_query>" }] } }),
        JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "First answer." }] } }),
        JSON.stringify({ role: "user", message: { content: [{ type: "text", text: "<user_query>\nSecond question\n</user_query>" }] } }),
        JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "Second answer." }] } }),
      ].join("\n"),
      "utf-8"
    );

    const turns = await parseCursorTranscriptFile(filePath, new Map());
    expect(turns).toHaveLength(2);
    expect(turns[0]?.turnId).toBe("composer-multi:1");
    expect(turns[0]?.promptText).toBe("First question");
    expect(turns[1]?.turnId).toBe("composer-multi:2");
    expect(turns[1]?.promptText).toBe("Second question");
  });

  it("reads transcript sessions using global composer headers metadata", async () => {
    const userDir = join(tempDir, "CursorUser");
    const globalDir = join(userDir, "globalStorage");
    const projectsDir = join(tempDir, "cursor-projects", "repo", "agent-transcripts", "composer-2");
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(projectsDir, { recursive: true });

    createItemTableDb(join(globalDir, "state.vscdb"), [
      {
        key: "composer.composerHeaders",
        value: JSON.stringify({
          allComposers: [
            {
              composerId: "composer-2",
              name: "Telemetry session",
              lastUpdatedAt: 1779269828871,
              workspaceIdentifier: {
                uri: { fsPath: "/Users/test/repo" },
              },
            },
          ],
        }),
      },
    ]);

    writeFileSync(
      join(projectsDir, "composer-2.jsonl"),
      [
        JSON.stringify({ role: "user", message: { content: [{ type: "text", text: "<user_query>\nWhat does npm pack do?\n</user_query>" }] } }),
        JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "It creates a tarball." }] } }),
      ].join("\n"),
      "utf-8"
    );

    const sessions = await readCursorTranscriptSessions(userDir, [join(tempDir, "cursor-projects")]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.composerName).toBe("Telemetry session");
    expect(sessions[0]?.workspacePath).toBe("/Users/test/repo");
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

describe("readDailyStats — security", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("verbose=false suppresses SQLite row value dump to console", () => {
    const wsDir = join(tempDir, "User", "globalStorage", "cursor.cursor-always-local-storage");
    mkdirSync(wsDir, { recursive: true });
    const dbPath = join(wsDir, "state.vscdb");
    createItemTableDb(dbPath, [
      { key: "aiCodeTracking", value: JSON.stringify({ tabSuggestedLines: 10 }) },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    readDailyStats(null, tempDir, false);
    // Confirm no raw row value (the aiCodeTracking JSON) was printed
    const allLogs = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allLogs).not.toContain("tabSuggestedLines");
    consoleSpy.mockRestore();
  });

  it("baseDir with path traversal resolves to an empty result (no FS reads outside glob)", () => {
    // Passing a path that resolves to a directory with no Cursor DB files.
    // Should return [] without crashing.
    const safeResult = readDailyStats(null, join(tmpdir(), "definitely-does-not-exist-12345"), false);
    expect(safeResult).toEqual([]);
  });

  it("deeply nested path traversal baseDir returns empty result", () => {
    // ../../../etc is resolved by glob but no .vscdb files exist there
    const result = readDailyStats(null, join(tmpdir(), "..", "..", "etc"), false);
    expect(result).toEqual([]);
  });

  it("returns empty when global state.vscdb is malformed", () => {
    const globalDir = join(tempDir, "globalStorage");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "state.vscdb"), readFileSync(malformedNotSqliteFixture));

    expect(readDailyStats(null, tempDir)).toEqual([]);
  });

  it("ignores symlinked state.vscdb files that resolve outside baseDir", () => {
    const outsideRoot = makeTempDir();
    try {
      const targetDb = join(outsideRoot, "outside", "state.vscdb");
      mkdirSync(join(targetDb, ".."), { recursive: true });
      createItemTableDb(targetDb, [
        {
          key: "aiCodeTracking.dailyStats.v1.5.2026-06-12",
          value: JSON.stringify({ tabSuggestedLines: 3, tabAcceptedLines: 1 }),
        },
      ]);

      const symlinkPath = join(tempDir, "workspaceStorage", "ws1", "state.vscdb");
      mkdirSync(join(symlinkPath, ".."), { recursive: true });
      symlinkSync(targetDb, symlinkPath);

      expect(readDailyStats(null, tempDir)).toEqual([]);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
