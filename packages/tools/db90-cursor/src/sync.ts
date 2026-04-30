import { readState, writeState } from "./state.js";
import { readEvents, readDailyStats, readRecentCommitSnapshots } from "./cursor-reader.js";
import { mapEvent, mapDailyStats, mapRecentCommit, type Db90Payload, type PricingConfig } from "./mapper.js";
import { postEvents } from "./client.js";

// Public surface re-exported so MCP consumers only need to import from "@db90/cursor/sync"
export { resolveProjectId, type ProjectResolution } from "./project-resolver.js";
export { DEFAULT_PRICING, type PricingConfig } from "./mapper.js";

export interface SyncResult {
  sent: number;
  failed: number;
  skipped: number;
}

export interface SyncOptions {
  token: string;
  host: string;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  // If undefined, read the watermark from state and advance state on success.
  // If supplied (Date or null), use as-is and do not advance state — matches the CLI's
  // --since override.
  since?: Date | null;
  // Per-driver pricing rates for cost_usd estimation. Omit to use DEFAULT_PRICING (fully
  // populated defaults from mapper.ts). MCP consumers should thread user config through.
  pricing?: PricingConfig;
}

export async function syncOnce(options: SyncOptions): Promise<SyncResult> {
  const { token, host, dryRun, verbose, projectId, since: explicitSince, pricing } = options;

  let since: Date | null;
  let sinceFromState: boolean;
  if (explicitSince !== undefined) {
    since = explicitSince;
    sinceFromState = false;
  } else {
    const state = readState();
    if (state.lastProcessedAt) {
      const fromState = new Date(state.lastProcessedAt);
      since = isNaN(fromState.getTime()) ? null : fromState;
    } else {
      since = null;
    }
    sinceFromState = true;
  }

  const rawEvents = readEvents(since, undefined, verbose);
  const dailyStats = readDailyStats(since, undefined, verbose);
  // AIX-170: Cursor's aiCodeTracking.recentCommit row is a separate ingest source
  // — one row per repo, overwritten on each commit — carrying line-add/delete counts
  // we turn into chat-style events with a commit-scoped metadata payload.
  const recentCommits = readRecentCommitSnapshots(since, undefined, verbose);

  const projectIdOpt = projectId ?? undefined;

  const mappedFromEvents = rawEvents
    .map(({ row, workspacePath }) => mapEvent(row, workspacePath, projectIdOpt, pricing))
    .filter((e): e is Db90Payload => e !== null);

  const mappedFromStats = dailyStats.flatMap((entry) => mapDailyStats(entry, projectIdOpt, pricing));

  const mappedFromRecent = recentCommits
    .map((snap) => mapRecentCommit(snap, projectIdOpt, pricing))
    .filter((e): e is Db90Payload => e !== null);

  const mappedEvents = [...mappedFromEvents, ...mappedFromStats, ...mappedFromRecent];

  if (mappedEvents.length === 0) {
    // Do NOT advance state when there are no events — clock-skew or backfilled rows
    // with older timestamps would be silently skipped.
    return { sent: 0, failed: 0, skipped: 0 };
  }

  if (dryRun) {
    console.log(`[dry-run] Would send ${mappedEvents.length} event(s):`);
    console.log(`[dry-run] Note: cost_usd values are estimates (see cost_model in metadata).`);
    for (const event of mappedEvents) {
      console.log(JSON.stringify(event, null, 2));
    }
    return { sent: mappedEvents.length, failed: 0, skipped: 0 };
  }

  const result = await postEvents(mappedEvents, host, token);

  // Advance watermark to the max occurred_at of sent events, not wall-clock "now".
  // This avoids skipping rows with timestamps earlier than "now" (backfills, clock skew).
  // Save progress even on partial failure so successful events aren't re-sent.
  if (sinceFromState && result.lastSentAt !== null) {
    writeState({ lastProcessedAt: result.lastSentAt });
  }

  return { sent: result.sent, failed: result.failed, skipped: 0 };
}
