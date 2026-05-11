import { readState, writeState, markSessionSent, APP_DIR } from "./state.js";
import { findTranscriptFiles, parseTranscriptFile, toDb90Payload, type SessionAggregate } from "./claude-reader.js";
import { postEvent } from "./client.js";
import { type PricingTable, getCostWarning } from "./pricing.js";

// Public surface re-exported so MCP consumers only need to import from "@db90/claude/sync"
export type { PricingTable, ModelPricing } from "./pricing.js";
export { DEFAULT_PRICING, mergePricing } from "./pricing.js";
export { resolveProjectId, type ProjectResolution } from "./project-resolver.js";

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
  pricing: PricingTable;
}

let backoffUntil: Date | null = null;

export async function syncOnce(options: SyncOptions): Promise<SyncResult> {
  const { token, host, dryRun, verbose, projectId, pricing } = options;

  if (backoffUntil && new Date() < backoffUntil) {
    if (verbose) {
      console.log(`[verbose] Rate limited — skipping until ${backoffUntil.toISOString()}`);
    } else {
      console.warn(`[db90-claude] Rate limited — skipping until ${backoffUntil.toISOString()}`);
    }
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const files = findTranscriptFiles();

  if (verbose) {
    console.log(`[verbose] Found ${files.length} transcript file(s)`);
  }

  // Phase 1: parse all transcript files in parallel, then keep only the most-complete
  // aggregate per session (highest combined token count). The same session ID can appear
  // in multiple files (e.g. both ~/.claude/projects/ and ~/.config/claude/projects/ may
  // have copies at different stages). Parallelising the reads cuts wall-time proportionally.
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

  let state = readState(APP_DIR, host, token);
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [sessionId, agg] of bestAggs) {
    const known = state.sessions[sessionId];

    // Skip if file size hasn't changed since last successful send
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
        backoffUntil = new Date(Math.max(
          backoffUntil?.getTime() ?? 0,
          Date.now() + retryAfter * 1000
        ));
        const reason = quotaExceeded ? "Monthly quota exceeded" : "Rate limited";
        console.warn(`[db90-claude] ${reason}. Pausing until ${backoffUntil.toISOString()}.`);
      }
    });
    if (ok) {
      state = markSessionSent(state, sessionId, agg.fileSize);
      writeState(state, APP_DIR, host, token);
      totalSent++;
    } else {
      totalFailed++;
    }
  }

  return { sent: totalSent, failed: totalFailed, skipped: totalSkipped };
}
