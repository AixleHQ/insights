import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  compareVersionTags,
  discoverDailyStatsVersionsInDb,
  isVersionNewerThanV1_5,
  mergeDailyStatsVersionDiscoveries,
  parseDailyStatsKey,
  parseVersionTag,
} from "../daily-stats-versions.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "db90-daily-stats-versions-test-"));
}

function createStateDbWithKeys(dbPath: string, keys: string[]): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
  for (const key of keys) {
    insert.run(key, "{}");
  }
  db.close();
}

describe("daily-stats-versions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses well-formed daily stats keys", () => {
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.v1.5.2026-06-12")).toEqual({
      version: "v1.5",
      date: "2026-06-12",
    });
  });

  it("returns null for malformed daily stats keys", () => {
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.v1.5")).toBeNull();
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.foo.2026-06-12")).toBeNull();
  });

  it("compares version tags numerically", () => {
    expect(parseVersionTag("v1.5")).toEqual([1, 5]);
    expect(compareVersionTags("v1.6", "v1.5")).toBeGreaterThan(0);
    expect(compareVersionTags("v1.5", "v1.5")).toBe(0);
    expect(isVersionNewerThanV1_5("v1.6")).toBe(true);
    expect(isVersionNewerThanV1_5("v1.5")).toBe(false);
  });

  it("discovers version buckets and unmatched keys", () => {
    const dbPath = join(tempDir, "globalStorage", "state.vscdb");
    createStateDbWithKeys(dbPath, [
      "aiCodeTracking.dailyStats.v1.5.2026-06-10",
      "aiCodeTracking.dailyStats.v1.6.2026-06-11",
      "aiCodeTracking.dailyStats.invalid",
    ]);

    const discovery = discoverDailyStatsVersionsInDb(dbPath);

    expect(discovery.buckets.map((b) => b.version)).toEqual(["v1.5", "v1.6"]);
    expect(discovery.highest_version).toBe("v1.6");
    expect(discovery.unmatched_keys).toContain("aiCodeTracking.dailyStats.invalid");
    expect(discovery.has_version_newer_than_v1_5).toBe(true);
  });

  it("returns empty discovery when ItemTable is missing", () => {
    const dbPath = join(tempDir, "workspaceStorage", "ws1", "state.vscdb");
    mkdirSync(join(dbPath, ".."), { recursive: true });
    const db = new Database(dbPath);
    db.exec("CREATE TABLE other (id INTEGER)");
    db.close();

    const discovery = discoverDailyStatsVersionsInDb(dbPath);
    expect(discovery.buckets).toEqual([]);
    expect(discovery.unmatched_keys).toEqual([]);
    expect(discovery.highest_version).toBeNull();
    expect(discovery.has_version_newer_than_v1_5).toBe(false);
  });

  it("returns empty discovery on corrupted sqlite files", () => {
    const dbPath = join(tempDir, "workspaceStorage", "ws2", "state.vscdb");
    mkdirSync(join(dbPath, ".."), { recursive: true });
    writeFileSync(dbPath, "not-a-sqlite-db", "utf-8");

    const discovery = discoverDailyStatsVersionsInDb(dbPath);
    expect(discovery.buckets).toEqual([]);
    expect(discovery.unmatched_keys).toEqual([]);
    expect(discovery.highest_version).toBeNull();
    expect(discovery.has_version_newer_than_v1_5).toBe(false);
  });

  it("merges discoveries across multiple db files", () => {
    const dbPathA = join(tempDir, "a", "state.vscdb");
    const dbPathB = join(tempDir, "b", "state.vscdb");
    createStateDbWithKeys(dbPathA, [
      "aiCodeTracking.dailyStats.v1.5.2026-06-10",
      "aiCodeTracking.dailyStats.v1.5.2026-06-11",
    ]);
    createStateDbWithKeys(dbPathB, [
      "aiCodeTracking.dailyStats.v1.6.2026-06-12",
      "aiCodeTracking.dailyStats.invalid",
    ]);

    const merged = mergeDailyStatsVersionDiscoveries([
      discoverDailyStatsVersionsInDb(dbPathA),
      discoverDailyStatsVersionsInDb(dbPathB),
    ]);

    expect(merged.buckets.map((b) => [b.version, b.key_count])).toEqual([
      ["v1.5", 2],
      ["v1.6", 1],
    ]);
    expect(merged.highest_version).toBe("v1.6");
    expect(merged.unmatched_keys).toContain("aiCodeTracking.dailyStats.invalid");
    expect(merged.has_version_newer_than_v1_5).toBe(true);
  });
});
