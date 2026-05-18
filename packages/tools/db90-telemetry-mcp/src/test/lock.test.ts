import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { acquireSyncLock } from "../lock.js";

describe("acquireSyncLock", () => {
  it("does not let a stale lock owner release a newer active lock", () => {
    const appDir = mkdtempSync(join(tmpdir(), "db90-mcp-lock-"));
    const oldLock = acquireSyncLock(appDir, 1_000);
    expect(oldLock.acquired).toBe(true);

    const lockPath = join(appDir, "state.lock");
    writeFileSync(lockPath, "999999:dead-owner", "utf-8");
    const staleDate = new Date(Date.now() - 60_000);
    utimesSync(lockPath, staleDate, staleDate);

    const newLock = acquireSyncLock(appDir, 1);
    expect(newLock.acquired).toBe(true);

    oldLock.release();
    const blocked = acquireSyncLock(appDir, 60_000);
    expect(blocked.acquired).toBe(false);

    newLock.release();
  });

  it("does not reap a stale lock while the owning process is alive", () => {
    const appDir = mkdtempSync(join(tmpdir(), "db90-mcp-lock-"));
    const lock = acquireSyncLock(appDir, 1_000);
    expect(lock.acquired).toBe(true);

    const staleDate = new Date(Date.now() - 60_000);
    utimesSync(join(appDir, "state.lock"), staleDate, staleDate);

    const blocked = acquireSyncLock(appDir, 1);
    expect(blocked.acquired).toBe(false);

    lock.release();
  });

  it("reaps a stale lock when the owning process is gone", () => {
    const appDir = mkdtempSync(join(tmpdir(), "db90-mcp-lock-"));
    const lockPath = join(appDir, "state.lock");
    const staleDate = new Date(Date.now() - 60_000);
    writeFileSync(lockPath, "999999:dead-owner", "utf-8");
    utimesSync(lockPath, staleDate, staleDate);

    const lock = acquireSyncLock(appDir, 1);
    expect(lock.acquired).toBe(true);

    lock.release();
  });
});
