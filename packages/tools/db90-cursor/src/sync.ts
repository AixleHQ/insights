import { APP_DIR, migrateLegacyState, readState, stateKey, writeState } from "./state.js";
import { collectSyncPayloads } from "./collect-payloads.js";
import type { Db90Payload, PricingConfig } from "./mapper.js";
import { postEvents } from "./client.js";
import {
  summarizeDryRunMatrix,
  validateCursorPayload,
} from "./payload-contract.js";

import {
  enrichCommitProjectAttribution,
  type ProjectResolution,
} from "@db90/sdk";

// Public surface re-exported so MCP consumers only need to import from "@db90/cursor/sync"
export { resolveProjectId, enrichCommitProjectAttribution, type ProjectResolution } from "@db90/sdk";
export { DEFAULT_PRICING, type PricingConfig } from "./mapper.js";
export { collectSyncPayloads, type CollectedPayloads, type CollectSyncPayloadsOptions } from "./collect-payloads.js";
export {
  validateCursorPayload,
  summarizeDryRunMatrix,
  inferIngestPath,
  type CursorIngestPath,
  type PayloadValidationResult,
  type DryRunMatrixRow,
} from "./payload-contract.js";

export interface SyncResult {
  sent: number;
  failed: number;
  skipped: number;
  /** Set when dry-run contract validation fails. */
  validationFailed?: boolean;
}

export interface SyncOptions {
  token: string;
  host: string;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  /** From `resolveProjectId().source` — controls commit `repo_name` lookup (CUR-V04). */
  projectIdSource?: ProjectResolution["source"];
  // If undefined, read the watermark from state and advance state on success.
  // If supplied (Date or null), use as-is and do not advance state — matches the CLI's
  // --since override.
  since?: Date | null;
  /** Ignore saved watermark; scan all local Cursor rows (dry-run / backfill). */
  fullScan?: boolean;
  // Per-driver pricing rates for cost_usd estimation. Omit to use DEFAULT_PRICING (fully
  // populated defaults from mapper.ts). MCP consumers should thread user config through.
  pricing?: PricingConfig;
}

let backoffUntil: Date | null = null;

function maxIsoTimestamp(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

function printDryRunValidationReport(payloads: Db90Payload[]): boolean {
  let allOk = true;
  for (let i = 0; i < payloads.length; i++) {
    const result = validateCursorPayload(payloads[i]);
    if (!result.ok) {
      allOk = false;
      console.error(`[dry-run] Payload #${i + 1} (${result.path}) contract errors:`);
      for (const err of result.errors) console.error(`  - ${err}`);
    }
  }

  const matrix = summarizeDryRunMatrix(payloads);
  console.log("[dry-run] Ingest path matrix:");
  for (const row of matrix) {
    console.log(
      `  ${row.path}: ${row.count} event(s)` +
        (row.sample_occurred_at ? ` (e.g. ${row.sample_occurred_at})` : "")
    );
  }

  const expectedPaths = ["daily_tab", "daily_composer", "recent_commit"] as const;
  const seen = new Set(matrix.map((r) => r.path));
  for (const path of expectedPaths) {
    if (!seen.has(path)) {
      console.warn(`[dry-run] No payloads for path "${path}" — OK if Cursor had no activity there`);
    }
  }

  if (allOk) {
    console.log("[dry-run] All payloads match the cursor ingest contract (DATA-CURSOR.md §3.5).");
  }
  return allOk;
}

export async function syncOnce(options: SyncOptions): Promise<SyncResult> {
  const {
    token,
    host,
    dryRun,
    verbose,
    projectId,
    projectIdSource,
    since: explicitSince,
    pricing,
    fullScan = false,
  } = options;

  if (backoffUntil && new Date() < backoffUntil) {
    if (verbose) {
      console.log(`[verbose] Rate limited — skipping until ${backoffUntil.toISOString()}`);
    } else {
      console.warn(`[db90-cursor] Rate limited — skipping until ${backoffUntil.toISOString()}`);
    }
    return { sent: 0, failed: 0, skipped: 0 };
  }

  migrateLegacyState(APP_DIR, host, token);

  let since: Date | null;
  let sinceRecentCommit: Date | null;
  let sinceFromState: boolean;
  const persistedState = readState(APP_DIR, host, token);

  if (verbose && !fullScan && explicitSince === undefined) {
    console.log(`[verbose] State file: ${stateKey(host, token)}.json`);
  }

  if (fullScan) {
    since = null;
    sinceRecentCommit = null;
    sinceFromState = false;
    if (verbose) console.log("[verbose] Full scan — ignoring saved watermark");
  } else if (explicitSince !== undefined) {
    since = explicitSince;
    sinceRecentCommit = explicitSince;
    sinceFromState = false;
  } else {
    if (persistedState.lastProcessedAt) {
      const fromState = new Date(persistedState.lastProcessedAt);
      since = isNaN(fromState.getTime()) ? null : fromState;
    } else {
      since = null;
    }
    if (persistedState.lastRecentCommitAt) {
      const fromCommit = new Date(persistedState.lastRecentCommitAt);
      sinceRecentCommit = isNaN(fromCommit.getTime()) ? since : fromCommit;
    } else {
      sinceRecentCommit = since;
    }
    sinceFromState = true;
  }

  const useCommitHashDedup = !fullScan && explicitSince === undefined;

  const { payloads: mappedEvents, counts } = collectSyncPayloads({
    since,
    sinceRecentCommit,
    lastRecentCommitHashes: useCommitHashDedup ? (persistedState.lastRecentCommitHashes ?? []) : undefined,
    recentCommitHashDedup: useCommitHashDedup,
    projectId,
    pricing,
    verbose,
  });

  await enrichCommitProjectAttribution(mappedEvents, {
    projectIdSource,
    host,
    token,
    verbose,
  });

  const mappedFromCommits = mappedEvents.filter(
    (p) => p.event_type === "commit" || p.metadata.source === "recent_commit"
  );
  const aggregateEvents = mappedEvents.filter(
    (p) => p.event_type !== "commit" && p.metadata.source !== "recent_commit"
  );

  if (verbose) {
    const dedupeNote =
      counts.dailyStatsEntriesRaw > counts.dailyStatsEntries
        ? ` (raw ${counts.dailyStatsEntriesRaw}, deduped ${counts.dailyStatsEntries})`
        : "";
    console.log(
      `[verbose] Sources: legacy=${counts.legacy}, dailyStats rows=${counts.dailyStatsEntries}${dedupeNote}, recentCommit=${counts.recentCommitSnapshots}`
    );
  }

  if (mappedEvents.length === 0) {
    if (verbose && !fullScan && persistedState.lastProcessedAt) {
      console.log(
        "[verbose] No new events (watermark is up to date). Use --full to re-print all local rows without posting."
      );
    }
    return { sent: 0, failed: 0, skipped: 0 };
  }

  if (dryRun) {
    console.log(`[dry-run] Would send ${mappedEvents.length} event(s):`);
    console.log(`[dry-run] Note: cost_usd values are estimates (see cost_model in metadata).`);
    for (const event of mappedEvents) {
      console.log(JSON.stringify(event, null, 2));
    }
    const contractOk = printDryRunValidationReport(mappedEvents);
    return {
      sent: mappedEvents.length,
      failed: 0,
      skipped: 0,
      validationFailed: !contractOk,
    };
  }

  const on429 = (retryAfter: number, quotaExceeded: boolean) => {
    backoffUntil = new Date(Math.max(backoffUntil?.getTime() ?? 0, Date.now() + retryAfter * 1000));
    const reason = quotaExceeded ? "Monthly quota exceeded" : "Rate limited";
    console.warn(`[db90-cursor] ${reason}. Pausing until ${backoffUntil.toISOString()}.`);
  };

  const aggregateResult =
    aggregateEvents.length > 0
      ? await postEvents(aggregateEvents, host, token, { on429 })
      : { sent: 0, failed: 0, lastSentAt: null };

  const commitResult =
    mappedFromCommits.length > 0
      ? await postEvents(mappedFromCommits, host, token, { on429 })
      : { sent: 0, failed: 0, lastSentAt: null };

  const sent = aggregateResult.sent + commitResult.sent;
  const failed = aggregateResult.failed + commitResult.failed;

  if (sinceFromState) {
    const lastProcessedAt = maxIsoTimestamp(aggregateResult.lastSentAt, commitResult.lastSentAt);
    if (lastProcessedAt !== null) {
      let lastRecentCommitHashes = persistedState.lastRecentCommitHashes ?? [];
      if (commitResult.sent > 0) {
        const sentHashes = mappedFromCommits
          .map((p) => p.metadata.commit_hash)
          .filter((h): h is string => typeof h === "string");
        if (sentHashes.length > 0) lastRecentCommitHashes = sentHashes;
      }

      writeState(
        {
          lastProcessedAt,
          lastRecentCommitAt:
            commitResult.lastSentAt ?? persistedState.lastRecentCommitAt ?? null,
          lastRecentCommitHashes,
        },
        APP_DIR,
        host,
        token
      );
    }
  }

  return { sent, failed, skipped: 0 };
}
