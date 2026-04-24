import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readState, writeState, markSessionSent, stateKey } from "../state.js";

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

describe("stateKey", () => {
  it("extracts the hostname from the host URL", () => {
    expect(stateKey("https://app.db90.io", "tok")).toMatch(/^state-app\.db90\.io-[0-9a-f]{8}$/);
  });

  it("produces different keys for different tokens on the same host", () => {
    const keyA = stateKey("https://app.db90.io", "token-a");
    const keyB = stateKey("https://app.db90.io", "token-b");
    expect(keyA).not.toBe(keyB);
  });

  it("produces different keys for different hosts with the same token", () => {
    const keyA = stateKey("https://org1.db90.io", "same-token");
    const keyB = stateKey("https://org2.db90.io", "same-token");
    expect(keyA).not.toBe(keyB);
  });

  it("is stable — same inputs always produce the same key", () => {
    const key1 = stateKey("https://app.db90.io", "my-secret-token");
    const key2 = stateKey("https://app.db90.io", "my-secret-token");
    expect(key1).toBe(key2);
  });

  it("sanitises an invalid URL instead of throwing", () => {
    expect(() => stateKey("not-a-url", "tok")).not.toThrow();
    expect(stateKey("not-a-url", "tok")).toMatch(/^state-/);
  });
});

describe("per-credential state scoping", () => {
  it("uses separate files for different host+token pairs", () => {
    const stateA = { version: 1, sessions: { "session-a": { fileSize: 100, sentAt: "2024-01-01T00:00:00.000Z" } } };
    const stateB = { version: 1, sessions: { "session-b": { fileSize: 200, sentAt: "2024-01-01T00:00:00.000Z" } } };

    writeState(stateA, testDir, "https://app.db90.io", "token-a");
    writeState(stateB, testDir, "https://app.db90.io", "token-b");

    const readA = readState(testDir, "https://app.db90.io", "token-a");
    const readB = readState(testDir, "https://app.db90.io", "token-b");

    expect(readA.sessions["session-a"]).toBeDefined();
    expect(readA.sessions["session-b"]).toBeUndefined();
    expect(readB.sessions["session-b"]).toBeDefined();
    expect(readB.sessions["session-a"]).toBeUndefined();
  });

  it("falls back to state.json when no host+token supplied (legacy/test mode)", () => {
    writeState({ version: 1, sessions: { legacy: { fileSize: 1, sentAt: "2024-01-01T00:00:00.000Z" } } }, testDir);
    const state = readState(testDir);
    expect(state.sessions["legacy"]).toBeDefined();
  });

  it("returns empty state for a new host+token even when other state files exist", () => {
    writeState({ version: 1, sessions: { s: { fileSize: 1, sentAt: "2024-01-01T00:00:00.000Z" } } }, testDir, "https://a.io", "tok-a");
    const fresh = readState(testDir, "https://b.io", "tok-b");
    expect(fresh.sessions).toEqual({});
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
