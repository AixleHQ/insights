import type { ProjectResolution } from "./lib/index.js";
import { enrichCommitProjectAttribution } from "./lib/index.js";
import type { State } from "./state.js";
import {
  CURSOR_DAILY_STATS_WATERMARK_KEY,
  CURSOR_EVENTS_WATERMARK_KEY,
  CURSOR_RECENT_COMMIT_WATERMARK_KEY,
  CURSOR_TRANSCRIPT_TURN_PREFIX,
  CURSOR_WATERMARK_KEY,
  cursorTranscriptTurnStateKey,
  cursorWatermarkDate,
  filterRecentCommitsByHashDedup,
} from "./cursor-checkpoints.js";
import { readCursorActiveModel } from "./cursor-settings.js";
import {
  readEvents as readCursorEvents,
  readDailyStatsWithDedupe,
  readRecentCommitSnapshots,
  readCursorTranscriptSessions,
  mapEvent as mapCursorEvent,
  mapTranscriptTurn as mapCursorTranscriptTurn,
  mapDailyStats,
  mapRecentCommit,
  DEFAULT_CURSOR_PRICING,
  type CursorDb90Payload,
  type CursorTranscriptTurn,
  type PricingConfig,
} from "./readers/cursor.js";

export interface CursorSliceGroup {
  key: string;
  label: string;
  payloads: CursorDb90Payload[];
}

export interface PrepareCursorSliceGroupsOptions {
  stateBefore: State;
  fullScan?: boolean;
  projectId?: string | null;
  projectIdSource?: ProjectResolution["source"];
  host?: string;
  token?: string;
  projectLookupToken?: string | null;
  allowInsecureHttp?: boolean;
  verbose?: boolean;
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  cursorPricing?: PricingConfig;
}

export interface PreparedCursorSliceGroups {
  groups: CursorSliceGroup[];
  skippedTranscriptCount: number;
  totalPayloadCount: number;
  transcriptTurnsById: Map<string, CursorTranscriptTurn>;
  counts: {
    legacy: number;
    dailyStatsEntriesRaw: number;
    dailyStatsEntries: number;
    recentCommitSnapshots: number;
    transcriptTurns: number;
    transcriptPayloads: number;
    /** Chat events filtered from events+stats because transcript mode covers them. */
    suppressedComposer: number;
  };
}

export interface CollectLocalCursorPayloadsOptions {
  /** Ignore watermarks and commit hash dedupe (default true for verify scripts). */
  fullScan?: boolean;
  projectId?: string | null;
  verbose?: boolean;
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  cursorPricing?: PricingConfig;
  stateBefore?: State;
}

export interface CollectedCursorPayloads {
  payloads: CursorDb90Payload[];
  counts: PreparedCursorSliceGroups["counts"];
}

/**
 * Read local Cursor stores, apply watermarks/dedupe, and group payloads for sync posting.
 */
export async function prepareCursorSliceGroups(
  options: PrepareCursorSliceGroupsOptions
): Promise<PreparedCursorSliceGroups> {
  const {
    stateBefore,
    fullScan = false,
    projectId = null,
    projectIdSource,
    host,
    token,
    projectLookupToken,
    allowInsecureHttp,
    verbose = false,
    cursorBaseDir,
    cursorTranscriptProjectDirs,
    cursorPricing = DEFAULT_CURSOR_PRICING,
  } = options;

  const useCommitHashDedup = !fullScan;
  const eventsSince = fullScan
    ? null
    : cursorWatermarkDate(stateBefore, CURSOR_EVENTS_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const dailyStatsSince = fullScan
    ? null
    : cursorWatermarkDate(stateBefore, CURSOR_DAILY_STATS_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const recentCommitSince = fullScan
    ? null
    : cursorWatermarkDate(stateBefore, CURSOR_RECENT_COMMIT_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const commitReadSince = useCommitHashDedup ? null : recentCommitSince;

  if (verbose && fullScan) {
    console.log("[verbose][cursor] Full scan — ignoring saved watermarks and commit hash dedupe");
  }

  const baseDir = cursorBaseDir;
  const activeModelResolution = readCursorActiveModel(baseDir);
  const activeModel = activeModelResolution.model ?? undefined;
  const modelResolution = activeModelResolution.source;
  const transcriptTurns = await readCursorTranscriptSessions(baseDir, cursorTranscriptProjectDirs, verbose);
  const rawEvents = readCursorEvents(eventsSince, baseDir, verbose);
  const { raw: dailyStatsRaw, deduped: dailyStats } = readDailyStatsWithDedupe(
    dailyStatsSince,
    baseDir,
    verbose
  );
  const recentCommitSnapshots = readRecentCommitSnapshots(commitReadSince, baseDir, verbose);

  const projectIdOpt = projectId ?? undefined;
  const transcriptTurnsById = new Map(transcriptTurns.map((turn) => [turn.turnId, turn]));
  const transcriptPayloads = [...transcriptTurnsById.values()]
    .filter((turn) => {
      if (fullScan) return true;
      const known = stateBefore.sessions[cursorTranscriptTurnStateKey(turn.turnId)];
      if (!known) return true;
      // Prefer content hash comparison when both sides have it (fileSize is a fallback)
      if (known.contentHash && turn.contentHash) return known.contentHash !== turn.contentHash;
      return known.fileSize !== turn.fileSize;
    })
    .map((turn) => mapCursorTranscriptTurn(turn, projectIdOpt, cursorPricing, activeModel, modelResolution))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const skippedTranscriptCount = transcriptTurns.length - transcriptPayloads.length;
  const transcriptModeEnabled = transcriptTurnsById.size > 0;

  const allMappedFromEvents = rawEvents
    .map(({ row, workspacePath }) => mapCursorEvent(row, workspacePath, projectIdOpt, cursorPricing))
    .filter((e): e is CursorDb90Payload => e !== null);
  const allMappedFromStats = dailyStats
    .flatMap((entry) => mapDailyStats(entry, projectIdOpt, cursorPricing, activeModel, modelResolution));

  // When transcripts are present they cover the same chat activity — suppress the daily aggregates
  // to prevent double-counting. Logged at info level in sync.ts via counts.suppressedComposer.
  const mappedFromEvents = allMappedFromEvents.filter(
    (payload) => !transcriptModeEnabled || payload.event_type !== "chat"
  );
  const mappedFromStats = allMappedFromStats.filter(
    (payload) => !transcriptModeEnabled || payload.event_type !== "chat"
  );
  const suppressedComposer = transcriptModeEnabled
    ? allMappedFromEvents.filter((p) => p.event_type === "chat").length +
      allMappedFromStats.filter((p) => p.event_type === "chat").length
    : 0;

  let mappedFromCommits = recentCommitSnapshots
    .map((snapshot) => mapRecentCommit(snapshot, projectIdOpt, cursorPricing, activeModel, modelResolution))
    .filter((payload): payload is CursorDb90Payload => payload !== null)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  if (useCommitHashDedup) {
    mappedFromCommits = filterRecentCommitsByHashDedup(
      mappedFromCommits,
      stateBefore.lastRecentCommitHashes
    );
  }

  if (host) {
    const lookupToken = projectLookupToken ?? token;
    if (lookupToken) {
      await enrichCommitProjectAttribution(mappedFromCommits, {
        projectIdSource,
        host,
        token: lookupToken,
        allowInsecureHttp,
        verbose,
      });
    }
  }

  const groups: CursorSliceGroup[] = [
    {
      key: CURSOR_TRANSCRIPT_TURN_PREFIX,
      label: "transcripts",
      payloads: transcriptPayloads,
    },
    {
      key: CURSOR_EVENTS_WATERMARK_KEY,
      label: "events",
      payloads: mappedFromEvents.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    },
    {
      key: CURSOR_DAILY_STATS_WATERMARK_KEY,
      label: "daily_stats",
      payloads: mappedFromStats.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    },
    {
      key: CURSOR_RECENT_COMMIT_WATERMARK_KEY,
      label: "recent_commit",
      payloads: mappedFromCommits,
    },
  ];

  const totalPayloadCount = groups.reduce((sum, group) => sum + group.payloads.length, 0);

  return {
    groups,
    skippedTranscriptCount,
    totalPayloadCount,
    transcriptTurnsById,
    counts: {
      legacy: mappedFromEvents.length,
      dailyStatsEntriesRaw: dailyStatsRaw.length,
      dailyStatsEntries: dailyStats.length,
      recentCommitSnapshots: recentCommitSnapshots.length,
      transcriptTurns: transcriptTurns.length,
      transcriptPayloads: transcriptPayloads.length,
      suppressedComposer,
    },
  };
}

/** Flat payload list for dry-run verification scripts (no POST). */
export async function collectLocalCursorPayloads(
  options: CollectLocalCursorPayloadsOptions = {}
): Promise<CollectedCursorPayloads> {
  const {
    fullScan = true,
    projectId = null,
    verbose = false,
    cursorBaseDir,
    cursorTranscriptProjectDirs,
    cursorPricing,
    stateBefore = { version: 1, sessions: {} },
  } = options;

  const prepared = await prepareCursorSliceGroups({
    stateBefore,
    fullScan,
    projectId,
    verbose,
    cursorBaseDir,
    cursorTranscriptProjectDirs,
    cursorPricing,
  });

  return {
    payloads: prepared.groups.flatMap((group) => group.payloads),
    counts: prepared.counts,
  };
}
