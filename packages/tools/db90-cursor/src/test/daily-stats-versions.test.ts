import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  compareVersionTags,
  discoverDailyStatsVersionsInDb,
  isVersionNewerThanV1_5,
  mergeDailyStatsVersionDiscoveries,
  parseDailyStatsKey,
} from "../daily-stats-versions.js";

function createItemTableDb(dbPath: string, keys: string[]): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
  for (const key of keys) {
    insert.run(key, "{}");
  }
  db.close();
}

describe("parseDailyStatsKey", () => {
  it("parses v1.5 and v1.6 dated keys", () => {
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.v1.5.2026-05-01")).toEqual({
      version: "v1.5",
      date: "2026-05-01",
    });
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.v1.6.2026-06-01")).toEqual({
      version: "v1.6",
      date: "2026-06-01",
    });
  });

  it("rejects non-dated dailyStats keys", () => {
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.v1.5")).toBeNull();
    expect(parseDailyStatsKey("aiCodeTracking.dailyStats.experimental")).toBeNull();
  });
});

describe("compareVersionTags", () => {
  it("orders v1.6 after v1.5", () => {
    expect(compareVersionTags("v1.6", "v1.5")).toBeGreaterThan(0);
    expect(isVersionNewerThanV1_5("v1.6")).toBe(true);
    expect(isVersionNewerThanV1_5("v1.5")).toBe(false);
  });
});

describe("discoverDailyStatsVersionsInDb", () => {
  it("groups keys by version prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-v11-"));
    const dbPath = join(root, "state.vscdb");
    createItemTableDb(dbPath, [
      "aiCodeTracking.dailyStats.v1.5.2026-05-01",
      "aiCodeTracking.dailyStats.v1.5.2026-05-20",
      "aiCodeTracking.dailyStats.v1.6.2026-06-01",
      "aiCodeTracking.dailyStats.v1.6.preview",
    ]);

    const discovery = discoverDailyStatsVersionsInDb(dbPath);
    expect(discovery.buckets).toHaveLength(2);
    expect(discovery.buckets.find((b) => b.version === "v1.5")?.key_count).toBe(2);
    expect(discovery.buckets.find((b) => b.version === "v1.6")?.key_count).toBe(1);
    expect(discovery.unmatched_keys).toEqual(["aiCodeTracking.dailyStats.v1.6.preview"]);
    expect(discovery.has_version_newer_than_v1_5).toBe(true);
    expect(discovery.highest_version).toBe("v1.6");
  });
});

describe("mergeDailyStatsVersionDiscoveries", () => {
  it("sums counts across databases", () => {
    const a = discoverDailyStatsVersionsInDb(
      (() => {
        const root = mkdtempSync(join(tmpdir(), "db90-v11a-"));
        const p = join(root, "a.vscdb");
        createItemTableDb(p, ["aiCodeTracking.dailyStats.v1.5.2026-01-01"]);
        return p;
      })()
    );
    const b = discoverDailyStatsVersionsInDb(
      (() => {
        const root = mkdtempSync(join(tmpdir(), "db90-v11b-"));
        const p = join(root, "b.vscdb");
        createItemTableDb(p, ["aiCodeTracking.dailyStats.v1.5.2026-02-01"]);
        return p;
      })()
    );

    const merged = mergeDailyStatsVersionDiscoveries([a, b]);
    expect(merged.buckets).toHaveLength(1);
    expect(merged.buckets[0].key_count).toBe(2);
  });
});
