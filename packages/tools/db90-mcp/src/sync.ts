// Orchestrator that calls into @db90/claude/sync and @db90/cursor/sync
// once Track A publishes them to npm (or to a local verdaccio for testing).
// The interfaces below match Task 02's exports exactly; the actual import
// lines and runClaude/runCursor bodies are wired in Task 10's swap PR
// (post-publish-of-Track-A) once `npm install` of MCP can resolve the deps.
//
// On Task 10 (swap):
//   1) Add deps to package.json: "@db90/claude": "^0.1.0",
//      "@db90/cursor": "^0.1.0".
//   2) Replace the stub bodies below with one-line calls into the
//      published syncOnce exports.
//   3) Drop the local SyncTaskResult re-declaration once the typed imports
//      are in (the SyncResult shape comes from each CLI's ./sync entry).

import { acquireLock, releaseLock } from "./lock.js";
import { loadCredentials } from "./keychain.js";
import { loadState, saveState } from "./state.js";
import { recordError } from "./log.js";

// Mirrors the SyncResult shape from claude/cursor's ./sync entries.
export interface SyncTaskResult {
  sent: number;
  failed: number;
  skipped: number;
}

export interface SyncSummary {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

const EMPTY_SUMMARY: SyncSummary = { sent: 0, failed: 0, skipped: 0, errors: [] };

// Stubbed for 0.1.0 scaffold. Replaced in Task 10 by:
//   import { syncOnce, DEFAULT_PRICING } from "@db90/claude/sync";
//   return syncOnce({ token, host, dryRun: false, verbose: false,
//                     projectId: null, pricing: DEFAULT_PRICING });
// NOTE on payload shape (AIX-140): claude events now include
// metadata.{risk_level, risk_categories, risk_score, scannable: true}, populated
// inside toDb90Payload via risk-scanner.ts. The MCP server doesn't shape payloads
// — it just calls syncOnce — so no thread-through is required. But db90_status
// surface (Task 09) should expose risk-level counters so the model can answer
// "any high-risk events recently?" without needing the dashboard.
async function runClaudeSync(_token: string, _host: string): Promise<SyncTaskResult> {
  return { sent: 0, failed: 0, skipped: 0 };
}

// Stubbed for 0.1.0 scaffold. Replaced in Task 10 by:
//   import { syncOnce, DEFAULT_PRICING } from "@db90/cursor/sync";
//   return syncOnce({ token, host, dryRun: false, verbose: false,
//                     projectId: null, pricing: DEFAULT_PRICING });
// IMPORTANT: thread `pricing` through (AIX-138) — cursor events now carry
// cost_usd estimates and a cost_model audit trail. Dropping pricing here would
// silently send DEFAULT_PRICING-derived costs even when the user has overridden
// rates in their cursor config; future MCP `db90_status` should expose the
// effective pricing so the model can answer "what rates are being used?".
async function runCursorSync(_token: string, _host: string): Promise<SyncTaskResult> {
  return { sent: 0, failed: 0, skipped: 0 };
}

export async function syncAll(): Promise<SyncSummary> {
  const creds = await loadCredentials();
  if (!creds) {
    return { ...EMPTY_SUMMARY, errors: ["not authenticated"] };
  }

  if (!acquireLock()) {
    return { ...EMPTY_SUMMARY, errors: ["another sync is in progress"] };
  }

  const summary: SyncSummary = { sent: 0, failed: 0, skipped: 0, errors: [] };
  try {
    const results = await Promise.allSettled([
      runClaudeSync(creds.ingestToken, creds.host),
      runCursorSync(creds.ingestToken, creds.host),
    ]);

    for (const r of results) {
      if (r.status === "fulfilled") {
        summary.sent += r.value.sent;
        summary.failed += r.value.failed;
        summary.skipped += r.value.skipped;
      } else {
        summary.failed += 1;
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        recordError(`sync: ${message}`);
        summary.errors.push(message);
      }
    }

    const state = loadState();
    state.lastSyncAt = new Date().toISOString();
    state.errorsCount += summary.failed;
    saveState(state);
  } finally {
    releaseLock();
  }

  return summary;
}
