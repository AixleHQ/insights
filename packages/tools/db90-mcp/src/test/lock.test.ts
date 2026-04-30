import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * lock.ts computes LOCK_FILE from APP_DIR which is resolved at module
 * evaluation time.  We mock ../log.js to inject a per-test temp directory
 * so tests are isolated from the real ~/.db90-mcp directory.
 */

let tmp: string;
let appDir: string;
let lockFile: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "db90-mcp-lock-test-"));
  appDir = join(tmp, ".db90-mcp");
  lockFile = join(appDir, "state.lock");
  vi.resetModules();
  // Inject a temp-dir-backed APP_DIR so lock.ts uses isolated paths.
  vi.doMock("../log.js", () => ({ APP_DIR: appDir }));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

describe("acquireLock / releaseLock — happy path", () => {
  it("acquires the lock and returns true", async () => {
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
  });

  it("release after acquire: lock file is removed", async () => {
    const { acquireLock, releaseLock } = await import("../lock.js");
    acquireLock();
    releaseLock();
    expect(existsSync(lockFile)).toBe(false);
  });

  it("re-acquire after release succeeds", async () => {
    const { acquireLock, releaseLock } = await import("../lock.js");
    acquireLock();
    releaseLock();
    expect(acquireLock()).toBe(true);
  });
});

describe("acquireLock — double acquire (same process guard)", () => {
  it("second acquireLock without release returns false", async () => {
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
    // heldFd is now set on the same module instance → returns false immediately
    expect(acquireLock()).toBe(false);
  });
});

describe("acquireLock — stale lock edge cases", () => {
  it("NaN content in lock file is treated as stale → acquire succeeds", async () => {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, "NaN");
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
  });

  it("negative timestamp in lock file is treated as stale → acquire succeeds", async () => {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, "-99999");
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
  });

  it("empty string in lock file is treated as stale → acquire succeeds", async () => {
    // Number("") === 0, which is epoch 0 — very old, hence stale.
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, "");
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
  });

  it("non-numeric string in lock file is treated as stale → acquire succeeds", async () => {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, "corrupted-by-crash");
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
  });

  it("recent timestamp (now − 1 min) is NOT stale → acquire fails", async () => {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, String(Date.now() - 60_000));
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(false);
  });

  it("future timestamp is NOT stale → acquire fails", async () => {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, String(Date.now() + 3_600_000));
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(false);
  });
});

describe("releaseLock — edge cases", () => {
  it("releaseLock without prior acquireLock does not throw", async () => {
    const { releaseLock } = await import("../lock.js");
    expect(() => releaseLock()).not.toThrow();
  });

  it("TOCTOU: releaseLock when lock file was externally removed does not throw", async () => {
    const { acquireLock, releaseLock } = await import("../lock.js");
    acquireLock();
    // Simulate external process deleting the file while this process still holds the fd.
    if (existsSync(lockFile)) unlinkSync(lockFile);
    expect(() => releaseLock()).not.toThrow();
  });

  it("double releaseLock does not throw", async () => {
    const { acquireLock, releaseLock } = await import("../lock.js");
    acquireLock();
    releaseLock();
    expect(() => releaseLock()).not.toThrow();
  });
});

describe("acquireLock — APP_DIR creation", () => {
  it("creates APP_DIR if it does not exist and acquires the lock", async () => {
    // appDir does not exist yet (mkdirSync was not called in this test)
    expect(existsSync(appDir)).toBe(false);
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
    expect(existsSync(lockFile)).toBe(true);
  });
});

describe("TOCTOU documentation", () => {
  it("acquireLock writes a parseable numeric timestamp to the lock file", async () => {
    const { acquireLock } = await import("../lock.js");
    const before = Date.now();
    acquireLock();
    const after = Date.now();
    const raw = existsSync(lockFile) ? readFileSync(lockFile, "utf8") : "";
    const ts = Number(raw);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("stale lock (>STALE_MS) can be stolen by a second acquirer — documented race", async () => {
    // This test DOCUMENTS the known race: if a sync exceeds STALE_MS (10 min),
    // a second process treats the lock as stale, unlinks it, and acquires it —
    // resulting in two concurrent syncs.  Fix: heartbeat renewal (separate ticket).
    mkdirSync(appDir, { recursive: true });
    writeFileSync(lockFile, String(Date.now() - 11 * 60 * 1000));
    const { acquireLock } = await import("../lock.js");
    expect(acquireLock()).toBe(true);
  });
});
