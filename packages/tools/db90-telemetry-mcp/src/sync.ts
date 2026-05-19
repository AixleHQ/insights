import type { TelemetryToolId, StoredCredentials } from "./auth/credentials.js";
import {
  readState,
  writeState,
  markSessionSent,
  getAppDir,
  stateKey as credentialStateKey,
  migrateLegacyState,
} from "./state.js";
import {
  findTranscriptFiles,
  parseTranscriptFile,
  toDb90Payload,
  type SessionAggregate,
} from "./readers/claude.js";
import {
  readEvents as readCursorEvents,
  readDailyStats,
  readRecentCommitSnapshots,
  mapEvent as mapCursorEvent,
  mapDailyStats,
  mapRecentCommit,
  DEFAULT_CURSOR_PRICING,
  type CursorDb90Payload,
} from "./readers/cursor.js";
import { postEvent } from "./client.js";
import { type PricingTable, getCostWarning } from "./pricing.js";
import { acquireSyncLock } from "./lock.js";

/** Prefix for Claude Code session keys in shared MCP state. */
export const CLAUDE_STATE_PREFIX = "claude_code:" as const;

/** Cursor SQLite watermark checkpoints — never collide with Claude `claude_code:*` session keys. */
export const CURSOR_WATERMARK_KEY = "cursor:watermark" as const;
export const CURSOR_EVENTS_WATERMARK_KEY = "cursor:events_watermark" as const;
export const CURSOR_DAILY_STATS_WATERMARK_KEY = "cursor:daily_stats_watermark" as const;
export const CURSOR_RECENT_COMMIT_WATERMARK_KEY = "cursor:recent_commit_watermark" as const;

export function sessionStateKey(sessionId: string): string {
  return `${CLAUDE_STATE_PREFIX}${sessionId}`;
}

export interface SyncResult {
  sent: number;
  failed: number;
  skipped: number;
  locked?: boolean;
  errors?: string[];
  rateLimitedUntil?: string | null;
}

/** Legacy Claude-only sync options (backward compatible with existing tests/tooling). */
export interface SyncOptions {
  token: string;
  host: string;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  pricing: PricingTable;
  appDir?: string;
  transcriptBaseDirs?: string[];
}

export interface MultiSyncOptions {
  credentials: StoredCredentials;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  pricing: PricingTable;
  appDir?: string;
  transcriptBaseDirs?: string[];
  /** Synthetic Cursor paths for Vitest isolation. Omit for real installs. */
  cursorBaseDir?: string;
  tools?: TelemetryToolId[];
}

const backoffUntilByCredential = new Map<string, Date>();

let lastSyncAt: string | null = null;
let lastSyncResult: SyncResult | null = null;
let recentErrors: string[] = [];

export function getSyncTelemetry(): {
  lastSyncAt: string | null;
  lastResult: SyncResult | null;
  recentErrors: string[];
} {
  return { lastSyncAt, lastResult: lastSyncResult, recentErrors };
}

function recordTelemetry(result: SyncResult, errors: string[]): void {
  if (!result.locked) {
    lastSyncAt = new Date().toISOString();
    lastSyncResult = result;
  }
  if (result.locked) {
    recentErrors = [...recentErrors, "Sync skipped — another process holds the lock"].slice(-20);
  } else if (errors.length > 0 || result.failed > 0) {
    recentErrors = errors.slice(-20);
  } else {
    recentErrors = [];
  }
}

function mergeCredentialRateLimit(backoffKeys: Set<string>): string | null {
  let furthest: Date | null = null;
  for (const bk of backoffKeys) {
    const u = backoffUntilByCredential.get(bk);
    if (u && new Date() < u && (!furthest || u > furthest)) furthest = u;
  }
  return furthest?.toISOString() ?? null;
}

function dedupeTools(tools: readonly TelemetryToolId[]): TelemetryToolId[] {
  return [...new Set(tools)];
}

async function runClaudeSlice(options: SyncOptions): Promise<SyncResult> {
  const { token, host, dryRun, verbose, projectId, pricing } = options;
  const appDir = options.appDir ?? getAppDir();
  const backoffKey = credentialStateKey(host, token);
  const backoffUntil = backoffUntilByCredential.get(backoffKey) ?? null;
  const errors: string[] = [];

  if (backoffUntil && new Date() < backoffUntil) {
    const until = backoffUntil.toISOString();
    if (verbose) {
      console.log(`[verbose] Rate limited — skipping until ${until}`);
    } else {
      console.warn(`[db90-mcp] Rate limited — skipping until ${until}`);
    }
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      rateLimitedUntil: until,
    };
  }

  const files = findTranscriptFiles(options.transcriptBaseDirs);

  if (verbose) {
    console.log(`[verbose] Found ${files.length} transcript file(s)`);
  }

  const allFileSessions = await Promise.all(files.map((f) => parseTranscriptFile(f, verbose)));
  const bestAggs = new Map<string, SessionAggregate>();
  for (const fileSessions of allFileSessions) {
    for (const [sessionId, agg] of fileSessions) {
      const existing = bestAggs.get(sessionId);
      if (!existing || agg.tokensIn + agg.tokensOut > existing.tokensIn + existing.tokensOut) {
        bestAggs.set(sessionId, agg);
      }
    }
  }

  let state = readState(appDir, host, token);
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let shouldStopForBackoff = false;

  for (const [sessionId, agg] of bestAggs) {
    const sKey = sessionStateKey(sessionId);
    const known = state.sessions[sKey];

    if (known && known.fileSize === agg.fileSize) {
      totalSkipped++;
      if (verbose) {
        console.log(`[verbose] Skipping unchanged session ${sessionId}`);
      }
      continue;
    }

    const payload = toDb90Payload(agg, { projectId, pricing });

    if (verbose && payload.cost_usd === null) {
      if (!agg.model) {
        if (agg.tokensIn > 0 || agg.tokensOut > 0) {
          console.warn(`[warn] Session ${sessionId} has usage but no model — cost_usd will be null`);
        }
      } else {
        const warning = getCostWarning(agg.model, pricing);
        if (warning) console.warn(`[warn] ${warning}`);
      }
    }

    if (dryRun) {
      console.log(`[dry-run] Would send session ${sessionId}:`);
      console.log(JSON.stringify(payload, null, 2));
      totalSent++;
      continue;
    }

    if (verbose) {
      console.log(`[verbose] Sending session ${sessionId} (${agg.tokensIn + agg.tokensOut} tokens)`);
    }

    const ok = await postEvent(payload, host, token, {
      on429: (retryAfter, quotaExceeded) => {
        const currentBackoff = backoffUntilByCredential.get(backoffKey);
        const nextBackoff = new Date(Math.max(currentBackoff?.getTime() ?? 0, Date.now() + retryAfter * 1000));
        backoffUntilByCredential.set(backoffKey, nextBackoff);
        shouldStopForBackoff = true;
        const reason = quotaExceeded ? "Monthly quota exceeded" : "Rate limited";
        console.warn(`[db90-mcp] ${reason}. Pausing until ${nextBackoff.toISOString()}.`);
      },
    });
    if (ok) {
      state = markSessionSent(state, sKey, agg.fileSize);
      writeState(state, appDir, host, token);
      totalSent++;
    } else {
      totalFailed++;
      errors.push(`Failed to post session ${sessionId}`);
      if (shouldStopForBackoff) {
        break;
      }
    }
  }

  const result: SyncResult = { sent: totalSent, failed: totalFailed, skipped: totalSkipped };
  const currentBackoff = backoffUntilByCredential.get(backoffKey);
  if (currentBackoff && new Date() < currentBackoff) result.rateLimitedUntil = currentBackoff.toISOString();
  if (errors.length > 0) result.errors = errors;
  return result;
}

function cursorWatermarkDate(
  state: { sessions: Record<string, { sentAt: string }> },
  ...keys: string[]
): Date | null {
  const rec = keys
    .map((key) => state.sessions[key])
    .find((value) => value !== undefined);
  if (!rec) return null;
  const d = new Date(rec.sentAt);
  return isNaN(d.getTime()) ? null : d;
}

async function runCursorSlice(params: {
  token: string;
  host: string;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  appDir: string;
  cursorBaseDir?: string;
}): Promise<SyncResult> {
  const { token, host, dryRun, verbose, projectId, appDir, cursorBaseDir } = params;
  const backoffKey = credentialStateKey(host, token);
  const backoffUntil = backoffUntilByCredential.get(backoffKey) ?? null;

  if (backoffUntil && new Date() < backoffUntil) {
    const until = backoffUntil.toISOString();
    if (verbose) {
      console.log(`[verbose][cursor] Rate limited — skipping until ${until}`);
    } else {
      console.warn(`[db90-mcp][cursor] Rate limited — skipping until ${until}`);
    }
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      rateLimitedUntil: until,
    };
  }

  const stateBefore = readState(appDir, host, token);
  const eventsSince = cursorWatermarkDate(stateBefore, CURSOR_EVENTS_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const dailyStatsSince = cursorWatermarkDate(stateBefore, CURSOR_DAILY_STATS_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const recentCommitSince = cursorWatermarkDate(stateBefore, CURSOR_RECENT_COMMIT_WATERMARK_KEY, CURSOR_WATERMARK_KEY);

  const baseDir = cursorBaseDir;
  const rawEvents = readCursorEvents(eventsSince, baseDir, verbose);
  const dailyStats = readDailyStats(dailyStatsSince, baseDir, verbose);
  const recentCommits = readRecentCommitSnapshots(recentCommitSince, baseDir, verbose);

  const projectIdOpt = projectId ?? undefined;

  const mappedFromEvents = rawEvents
    .map(({ row, workspacePath }) => mapCursorEvent(row, workspacePath, projectIdOpt, DEFAULT_CURSOR_PRICING))
    .filter((e): e is CursorDb90Payload => e !== null);

  const mappedFromStats = dailyStats.flatMap((entry) =>
    mapDailyStats(entry, projectIdOpt, DEFAULT_CURSOR_PRICING)
  );

  const mappedFromRecent = recentCommits
    .map((snap) => mapRecentCommit(snap, projectIdOpt, DEFAULT_CURSOR_PRICING))
    .filter((e): e is CursorDb90Payload => e !== null);

  const groups: Array<{ key: string; label: string; payloads: CursorDb90Payload[] }> = [
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
      payloads: mappedFromRecent.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    },
  ];

  const totalPayloadCount = groups.reduce((sum, group) => sum + group.payloads.length, 0);
  if (totalPayloadCount === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  if (dryRun) {
    console.log(`[dry-run][cursor] Would send ${totalPayloadCount} event(s)`);
    for (const group of groups) {
      for (const ev of group.payloads) {
        console.log(JSON.stringify(ev, null, 2));
      }
    }
    return { sent: totalPayloadCount, failed: 0, skipped: 0 };
  }

  let shouldStopForBackoff = false;
  let stateMut = stateBefore;
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const errors: string[] = [];
  let abortRemaining = false;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    if (group.payloads.length === 0) continue;
    if (abortRemaining || shouldStopForBackoff) {
      totalSkipped += group.payloads.length;
      continue;
    }

    let groupLastSentAt: string | null = null;
    let groupFailed = false;

    for (let payloadIndex = 0; payloadIndex < group.payloads.length; payloadIndex++) {
      const payload = group.payloads[payloadIndex];
      const ok = await postEvent(payload, host, token, {
        on429: (retryAfter, quotaExceeded) => {
          const currentBackoff = backoffUntilByCredential.get(backoffKey);
          const nextBackoff = new Date(Math.max(currentBackoff?.getTime() ?? 0, Date.now() + retryAfter * 1000));
          backoffUntilByCredential.set(backoffKey, nextBackoff);
          shouldStopForBackoff = true;
          const reason = quotaExceeded ? "Monthly quota exceeded" : "Rate limited";
          console.warn(`[db90-mcp][cursor] ${reason}. Pausing until ${nextBackoff.toISOString()}.`);
        },
      });

      if (ok) {
        totalSent++;
        groupLastSentAt = payload.occurred_at;
        continue;
      }

      totalFailed++;
      groupFailed = true;
      abortRemaining = true;
      errors.push(`Cursor sync (${group.label}): failed to post ${payload.occurred_at}`);
      totalSkipped += group.payloads.length - payloadIndex - 1;
      break;
    }

    if (!groupFailed && groupLastSentAt !== null) {
      stateMut = {
        ...stateMut,
        sessions: {
          ...stateMut.sessions,
          [group.key]: { fileSize: 0, sentAt: groupLastSentAt },
        },
      };
      writeState(stateMut, appDir, host, token);
    }
  }

  const slice: SyncResult = {
    sent: totalSent,
    failed: totalFailed,
    skipped: totalSkipped,
  };

  const currentBackoff = backoffUntilByCredential.get(backoffKey);
  if (currentBackoff && new Date() < currentBackoff) {
    slice.rateLimitedUntil = currentBackoff.toISOString();
  }
  if (errors.length > 0 || shouldStopForBackoff) {
    if (shouldStopForBackoff) {
      errors.push("Cursor sync paused due to rate limiting");
    }
    slice.errors = errors;
  }

  return slice;
}

/**
 * Parallel multi-tool cycle under the global advisory ingest lock (`state.lock`).
 */
export async function syncTelemetryTools(options: MultiSyncOptions): Promise<SyncResult> {
  const appDir = options.appDir ?? getAppDir();
  const lock = acquireSyncLock(appDir);
  if (!lock.acquired) {
    const lockedResult: SyncResult = { sent: 0, failed: 0, skipped: 0, locked: true };
    recordTelemetry(lockedResult, []);
    return lockedResult;
  }

  try {
    const { credentials, dryRun, verbose, projectId, pricing } = options;
    const host = credentials.host;

    const requested: TelemetryToolId[] = dedupeTools(options.tools ?? ["claude_code", "cursor"]);
    const missingRequested = requested.filter((t) => !credentials.accounts[t]);
    if (missingRequested.length > 0) {
      const errors = [`Missing credentials for requested tool(s): ${missingRequested.join(", ")}`];
      const failedResult: SyncResult = { sent: 0, failed: missingRequested.length, skipped: 0, errors };
      recordTelemetry(failedResult, errors);
      return failedResult;
    }
    const withToken = requested.filter((t) => !!credentials.accounts[t]);

    if (withToken.length === 0) {
      const zero: SyncResult = { sent: 0, failed: 0, skipped: 0 };
      recordTelemetry(zero, []);
      return zero;
    }

    const uniqueTokens = new Set<string>();
    for (const t of withToken) {
      const tok = credentials.accounts[t];
      if (tok && uniqueTokens.has(tok)) continue;
      if (tok) migrateLegacyState(appDir, host, tok);
      if (tok) uniqueTokens.add(tok);
    }

    const tasks: Array<() => Promise<SyncResult & { tag: TelemetryToolId }>> = [];
    const sharedCredentialToken = uniqueTokens.size < withToken.length;

    if (withToken.includes("claude_code")) {
      const task = () =>
        runClaudeSlice({
          token: credentials.accounts.claude_code!,
          host,
          dryRun,
          verbose,
          projectId,
          pricing,
          appDir,
          transcriptBaseDirs: options.transcriptBaseDirs,
        }).then((r) => ({ ...r, tag: "claude_code" as const }));
      tasks.push(task);
    }

    if (withToken.includes("cursor")) {
      const task = () =>
        runCursorSlice({
          token: credentials.accounts.cursor!,
          host,
          dryRun,
          verbose,
          projectId,
          appDir,
          cursorBaseDir: options.cursorBaseDir,
        }).then((r) => ({ ...r, tag: "cursor" as const }));
      tasks.push(task);
    }

    type Tagged = SyncResult & { tag: TelemetryToolId };

    const wrappedTasks = tasks.map((runTask) => () =>
      runTask().catch((err: unknown): Error => (err instanceof Error ? err : new Error(String(err))))
    );
    const outcomes: Array<Tagged | Error> = sharedCredentialToken
      ? await (async () => {
          const sequential: Array<Tagged | Error> = [];
          for (const task of wrappedTasks) {
            sequential.push(await task());
          }
          return sequential;
        })()
      : await Promise.all(wrappedTasks.map((task) => task()));

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const errorsAcc: string[] = [];
    const backoffKeysForMerge = new Set<string>();

    for (const outcome of outcomes) {
      if (outcome instanceof Error) {
        failed++;
        errorsAcc.push(outcome.message);
        continue;
      }
      sent += outcome.sent;
      failed += outcome.failed;
      skipped += outcome.skipped;
      const tok =
        outcome.tag === "cursor" ? credentials.accounts.cursor : credentials.accounts.claude_code;
      if (tok) backoffKeysForMerge.add(credentialStateKey(host, tok));

      if (outcome.errors) errorsAcc.push(...outcome.errors);
    }

    const merged: SyncResult = { sent, failed, skipped };
    const rl = mergeCredentialRateLimit(backoffKeysForMerge);
    if (rl) merged.rateLimitedUntil = rl;
    if (errorsAcc.length > 0) merged.errors = errorsAcc;

    recordTelemetry(merged, errorsAcc);
    return merged;
  } finally {
    lock.release();
  }
}

/** Claude-only sync helper (delegates into `syncTelemetryTools`). */
export async function syncOnce(options: SyncOptions): Promise<SyncResult> {
  return syncTelemetryTools({
    credentials: { host: options.host, accounts: { claude_code: options.token } },
    dryRun: options.dryRun,
    verbose: options.verbose,
    projectId: options.projectId,
    pricing: options.pricing,
    appDir: options.appDir,
    transcriptBaseDirs: options.transcriptBaseDirs,
    tools: ["claude_code"],
  });
}
