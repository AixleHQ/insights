import { readState, writeState, markSessionSent, getAppDir, stateKey as credentialStateKey } from "./state.js";
import {
  findTranscriptFiles,
  parseTranscriptFile,
  toDb90Payload,
  type SessionAggregate,
} from "./readers/claude.js";
import { postEvent } from "./client.js";
import { type PricingTable, getCostWarning } from "./pricing.js";
import { acquireSyncLock } from "./lock.js";

/** Prefix for Claude Code session keys in shared MCP state (future tools use their own prefix). */
export const CLAUDE_STATE_PREFIX = "claude_code:" as const;

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

export interface SyncOptions {
  token: string;
  host: string;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  pricing: PricingTable;
  /** Override state directory (tests). Defaults to `getAppDir()`. */
  appDir?: string;
  /** Override transcript roots (tests). */
  transcriptBaseDirs?: string[];
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

async function runSyncPipeline(options: SyncOptions): Promise<SyncResult> {
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
    const result: SyncResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      rateLimitedUntil: until,
    };
    recordTelemetry(result, []);
    return result;
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

  if (verbose) {
    const fileCount = files.length;
    const sessionCount = bestAggs.size;
    if (fileCount !== sessionCount) {
      console.log(`[verbose] Deduplicated ${fileCount} file(s) → ${sessionCount} unique session(s)`);
    }
  }

  let state = readState(appDir, host, token);
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let shouldStopForBackoff = false;

  for (const [sessionId, agg] of bestAggs) {
    const stateKey = sessionStateKey(sessionId);
    const known = state.sessions[stateKey];

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
      state = markSessionSent(state, stateKey, agg.fileSize);
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
  recordTelemetry(result, errors);
  return result;
}

/**
 * Runs one Claude transcript → ingest sync cycle with an advisory lock around
 * `~/.db90-mcp/state.lock` (under `appDir` when overridden for tests).
 */
export async function syncOnce(options: SyncOptions): Promise<SyncResult> {
  const appDir = options.appDir ?? getAppDir();
  const lock = acquireSyncLock(appDir);
  if (!lock.acquired) {
    const lockedResult: SyncResult = { sent: 0, failed: 0, skipped: 0, locked: true };
    recordTelemetry(lockedResult, []);
    return lockedResult;
  }
  try {
    return await runSyncPipeline(options);
  } finally {
    lock.release();
  }
}
