import {
  readEvents,
  readDailyStatsWithDedupe,
  readRecentCommitSnapshots,
} from "./cursor-reader.js";
import {
  mapEvent,
  mapDailyStats,
  mapRecentCommit,
  type Db90Payload,
  type PricingConfig,
  DEFAULT_PRICING,
} from "./mapper.js";

export interface CollectSyncPayloadsOptions {
  since?: Date | null;
  sinceRecentCommit?: Date | null;
  /** All commit hashes already POSTed; skip payloads whose hash is in this set. */
  lastRecentCommitHashes?: string[];
  /**
   * Read the latest recentCommit regardless of timestamp (Cursor stores one row).
   * Used for normal sync so hash dedupe is authoritative; timestamp watermarks alone
   * can block retries after ingest accepted 202 but failed to persist.
   */
  recentCommitHashDedup?: boolean;
  projectId?: string | null;
  pricing?: PricingConfig;
  verbose?: boolean;
  /** Override Cursor User dir (for tests). */
  cursorBaseDir?: string;
}

export interface CollectedPayloads {
  payloads: Db90Payload[];
  counts: {
    legacy: number;
    /** ItemTable dailyStats rows before per-date dedupe (CUR-V06). */
    dailyStatsEntriesRaw: number;
    /** Rows returned by readDailyStats (after dedupe). */
    dailyStatsEntries: number;
    recentCommitSnapshots: number;
  };
}

/**
 * Read local Cursor stores and map to ingest payloads without posting.
 * Used by dry-run, contract verification, and the verify-dry-run-matrix script.
 */
export function collectSyncPayloads(options: CollectSyncPayloadsOptions = {}): CollectedPayloads {
  const {
    since = null,
    sinceRecentCommit = since,
    lastRecentCommitHashes,
    recentCommitHashDedup = false,
    projectId = null,
    pricing = DEFAULT_PRICING,
    verbose = false,
    cursorBaseDir,
  } = options;

  const projectIdOpt = projectId ?? undefined;
  const baseDir = cursorBaseDir;

  const rawEvents = readEvents(since, baseDir, verbose);
  const { raw: dailyStatsRaw, deduped: dailyStats } = readDailyStatsWithDedupe(
    since,
    baseDir,
    verbose
  );
  const commitSince = recentCommitHashDedup ? null : sinceRecentCommit;
  const recentCommits = readRecentCommitSnapshots(commitSince, baseDir, verbose);

  const mappedFromEvents = rawEvents
    .map(({ row, workspacePath }) => mapEvent(row, workspacePath, projectIdOpt, pricing))
    .filter((e): e is Db90Payload => e !== null);

  const mappedFromStats = dailyStats.flatMap((entry) => mapDailyStats(entry, projectIdOpt, pricing));

  let mappedFromCommits = recentCommits
    .map((snapshot) => mapRecentCommit(snapshot, projectIdOpt, pricing))
    .filter((e): e is Db90Payload => e !== null);

  if (recentCommitHashDedup && lastRecentCommitHashes && lastRecentCommitHashes.length > 0) {
    const seen = new Set(lastRecentCommitHashes);
    mappedFromCommits = mappedFromCommits.filter(
      (payload) => !seen.has(payload.metadata.commit_hash ?? "")
    );
  }

  return {
    payloads: [...mappedFromEvents, ...mappedFromStats, ...mappedFromCommits],
    counts: {
      legacy: mappedFromEvents.length,
      dailyStatsEntriesRaw: dailyStatsRaw.length,
      dailyStatsEntries: dailyStats.length,
      recentCommitSnapshots: recentCommits.length,
    },
  };
}
