import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readState, writeState, markSessionSent } from "../state.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "db90-claude-state-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("readState", () => {
  it("returns empty state when no file exists", () => {
    const state = readState(testDir);
    expect(state.version).toBe(1);
    expect(state.sessions).toEqual({});
  });

  it("reads a valid state file", () => {
    writeState(
      {
        version: 1,
        sessions: {
          "session-abc": { fileSize: 1234, sentAt: "2024-01-01T00:00:00.000Z" },
        },
      },
      testDir
    );
    const state = readState(testDir);
    expect(state.version).toBe(1);
    expect(state.sessions["session-abc"]).toEqual({
      fileSize: 1234,
      sentAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("returns empty state when file is malformed JSON", () => {
    writeFileSync(join(testDir, "state.json"), "not json", "utf-8");
    const state = readState(testDir);
    expect(state.sessions).toEqual({});
  });

  it("returns empty state when file has wrong shape", () => {
    writeFileSync(join(testDir, "state.json"), JSON.stringify({ foo: "bar" }), "utf-8");
    const state = readState(testDir);
    expect(state.sessions).toEqual({});
  });
});

describe("writeState", () => {
  it("writes state to disk atomically", () => {
    const state = {
      version: 1,
      sessions: {
        "my-session": { fileSize: 5000, sentAt: "2024-06-01T12:00:00.000Z" },
      },
    };
    writeState(state, testDir);

    const raw = readFileSync(join(testDir, "state.json"), "utf-8");
    const parsed = JSON.parse(raw) as typeof state;
    expect(parsed.version).toBe(1);
    expect(parsed.sessions["my-session"].fileSize).toBe(5000);
  });

  it("creates the directory if it does not exist", () => {
    const nested = join(testDir, "nested", "dir");
    expect(existsSync(nested)).toBe(false);
    writeState({ version: 1, sessions: {} }, nested);
    expect(existsSync(join(nested, "state.json"))).toBe(true);
  });

  it("overwrites existing state", () => {
    writeState({ version: 1, sessions: { s1: { fileSize: 100, sentAt: "2024-01-01T00:00:00.000Z" } } }, testDir);
    writeState({ version: 1, sessions: {} }, testDir);
    const state = readState(testDir);
    expect(state.sessions).toEqual({});
  });
});

describe("markSessionSent", () => {
  it("adds a new session record", () => {
    const state = { version: 1, sessions: {} };
    const updated = markSessionSent(state, "session-xyz", 9999);
    expect(updated.sessions["session-xyz"].fileSize).toBe(9999);
    expect(updated.sessions["session-xyz"].sentAt).toBeDefined();
  });

  it("updates an existing session record", () => {
    const state = {
      version: 1,
      sessions: { "session-xyz": { fileSize: 100, sentAt: "2024-01-01T00:00:00.000Z" } },
    };
    const updated = markSessionSent(state, "session-xyz", 200);
    expect(updated.sessions["session-xyz"].fileSize).toBe(200);
  });

  it("does not mutate the original state", () => {
    const state = { version: 1, sessions: {} };
    markSessionSent(state, "session-xyz", 100);
    expect(state.sessions).toEqual({});
  });

  it("preserves other sessions", () => {
    const state = {
      version: 1,
      sessions: { other: { fileSize: 50, sentAt: "2024-01-01T00:00:00.000Z" } },
    };
    const updated = markSessionSent(state, "new-session", 100);
    expect(updated.sessions["other"]).toBeDefined();
    expect(updated.sessions["new-session"]).toBeDefined();
  });
});
