/**
 * CUR-V11 — discover `aiCodeTracking.dailyStats` version prefixes on disk.
 * Keys look like: aiCodeTracking.dailyStats.v1.5.2026-05-20
 */
import type Database from "better-sqlite3";
import { openCursorSqliteReadonly } from "./readers/cursor-sqlite.js";

const STATE_TABLE = "ItemTable";
const DAILY_STATS_LIKE = "aiCodeTracking.dailyStats%";

/** Full key shape for a dated dailyStats row. */
export const DAILY_STATS_KEY_RE =
  /^aiCodeTracking\.dailyStats\.(v[\d.]+)\.(\d{4}-\d{2}-\d{2})$/;

export interface DailyStatsVersionBucket {
  version: string;
  key_count: number;
  date_min: string | null;
  date_max: string | null;
  /** Up to three sample keys (for verification docs). */
  sample_keys: string[];
}

export interface DailyStatsVersionDiscovery {
  buckets: DailyStatsVersionBucket[];
  /** Keys matching dailyStats% but not matching {@link DAILY_STATS_KEY_RE}. */
  unmatched_keys: string[];
  highest_version: string | null;
  /** True when a version newer than v1.5 is present (cursor-6 follow-up). */
  has_version_newer_than_v1_5: boolean;
}

export function parseDailyStatsKey(
  key: string
): { version: string; date: string } | null {
  const m = key.match(DAILY_STATS_KEY_RE);
  if (!m) return null;
  return { version: m[1], date: m[2] };
}

export function parseVersionTag(tag: string): number[] {
  if (!tag.startsWith("v")) return [];
  return tag
    .slice(1)
    .split(".")
    .map((part) => parseInt(part, 10))
    .filter((n) => !Number.isNaN(n));
}

export function compareVersionTags(a: string, b: string): number {
  const pa = parseVersionTag(a);
  const pb = parseVersionTag(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const V1_5 = "v1.5";

export function isVersionNewerThanV1_5(version: string): boolean {
  return compareVersionTags(version, V1_5) > 0;
}

function minDate(a: string | null, b: string): string {
  return a === null || b < a ? b : a;
}

function maxDate(a: string | null, b: string): string {
  return a === null || b > a ? b : a;
}

function mergeBuckets(
  target: Map<string, DailyStatsVersionBucket>,
  discovery: DailyStatsVersionDiscovery
): void {
  for (const bucket of discovery.buckets) {
    const existing = target.get(bucket.version);
    if (!existing) {
      target.set(bucket.version, { ...bucket, sample_keys: [...bucket.sample_keys] });
      continue;
    }
    existing.key_count += bucket.key_count;
    existing.date_min =
      bucket.date_min === null
        ? existing.date_min
        : minDate(existing.date_min, bucket.date_min);
    existing.date_max =
      bucket.date_max === null
        ? existing.date_max
        : maxDate(existing.date_max, bucket.date_max);
    for (const key of bucket.sample_keys) {
      if (existing.sample_keys.length >= 3) break;
      if (!existing.sample_keys.includes(key)) existing.sample_keys.push(key);
    }
  }
}

/**
 * Read all `aiCodeTracking.dailyStats%` keys from one `state.vscdb` file.
 */
export function discoverDailyStatsVersionsInDb(dbPath: string): DailyStatsVersionDiscovery {
  const byVersion = new Map<
    string,
    { count: number; dateMin: string | null; dateMax: string | null; samples: string[] }
  >();
  const unmatched: string[] = [];

  let db: Database.Database | null = null;
  try {
    const opened = openCursorSqliteReadonly(dbPath);
    if (!opened.ok) return emptyDiscovery();
    db = opened.db;
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(STATE_TABLE) as { name: string } | undefined;
    if (!table) {
      return emptyDiscovery();
    }

    const rows = db
      .prepare(`SELECT key FROM ${STATE_TABLE} WHERE key LIKE ?`)
      .all(DAILY_STATS_LIKE) as { key: string }[];

    for (const { key } of rows) {
      const parsed = parseDailyStatsKey(key);
      if (!parsed) {
        unmatched.push(key);
        continue;
      }
      const bucket = byVersion.get(parsed.version) ?? {
        count: 0,
        dateMin: null,
        dateMax: null,
        samples: [],
      };
      bucket.count += 1;
      bucket.dateMin = minDate(bucket.dateMin, parsed.date);
      bucket.dateMax = maxDate(bucket.dateMax, parsed.date);
      if (bucket.samples.length < 3) bucket.samples.push(key);
      byVersion.set(parsed.version, bucket);
    }
  } catch {
    return emptyDiscovery();
  } finally {
    db?.close();
  }

  return buildDiscovery(byVersion, unmatched);
}

function emptyDiscovery(): DailyStatsVersionDiscovery {
  return {
    buckets: [],
    unmatched_keys: [],
    highest_version: null,
    has_version_newer_than_v1_5: false,
  };
}

function buildDiscovery(
  byVersion: Map<
    string,
    { count: number; dateMin: string | null; dateMax: string | null; samples: string[] }
  >,
  unmatched: string[]
): DailyStatsVersionDiscovery {
  const buckets: DailyStatsVersionBucket[] = [...byVersion.entries()]
    .map(([version, b]) => ({
      version,
      key_count: b.count,
      date_min: b.dateMin,
      date_max: b.dateMax,
      sample_keys: b.samples,
    }))
    .sort((a, b) => compareVersionTags(a.version, b.version));

  let highest: string | null = null;
  for (const b of buckets) {
    if (highest === null || compareVersionTags(b.version, highest) > 0) {
      highest = b.version;
    }
  }

  const hasNewer = buckets.some((b) => isVersionNewerThanV1_5(b.version));

  return {
    buckets,
    unmatched_keys: unmatched.sort(),
    highest_version: highest,
    has_version_newer_than_v1_5: hasNewer || unmatched.length > 0,
  };
}

/** Merge discoveries from global + workspace `state.vscdb` files (dedupe sample keys only). */
export function mergeDailyStatsVersionDiscoveries(
  discoveries: DailyStatsVersionDiscovery[]
): DailyStatsVersionDiscovery {
  const merged = new Map<string, DailyStatsVersionBucket>();
  const unmatched = new Set<string>();

  for (const d of discoveries) {
    mergeBuckets(merged, d);
    for (const key of d.unmatched_keys) unmatched.add(key);
  }

  const buckets = [...merged.values()].sort((a, b) =>
    compareVersionTags(a.version, b.version)
  );
  let highest: string | null = null;
  for (const b of buckets) {
    if (highest === null || compareVersionTags(b.version, highest) > 0) {
      highest = b.version;
    }
  }

  return {
    buckets,
    unmatched_keys: [...unmatched].sort(),
    highest_version: highest,
    has_version_newer_than_v1_5:
      buckets.some((b) => isVersionNewerThanV1_5(b.version)) || unmatched.size > 0,
  };
}
