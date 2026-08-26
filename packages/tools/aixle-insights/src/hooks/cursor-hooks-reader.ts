import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { State } from "../state.js";
import { markSessionSent } from "../state.js";
import { postEvent } from "../client.js";
import { mcpLog } from "../log.js";
import type { HookLogEvent } from "./hooks-config.js";
import {
  shouldIngestHookEvent,
  mapHookEventToPayload,
  hookDedupeKey,
  warnOnCursorVersion,
  CURSOR_HOOK_STATE_PREFIX,
} from "./cursor-hooks-mapper.js";
import { isRepoPathWithinRoot, normalizeRepoPathCandidate } from "../lib/repo-path-safety.js";

export { CURSOR_HOOK_STATE_PREFIX };

export interface ProcessHooksQueueParams {
  queuePath: string;
  /** Only process events whose workspace_roots[0] is under this directory. Omit to process all. */
  scopeDir?: string;
  state: State;
  host: string;
  token: string;
  /** Mirrors StoredCredentials.insecureHttpAllowed — set when `init --insecure` was used for this host. */
  allowInsecureHttp?: boolean;
  /** Called when a 429 is received. */
  on429: (retryAfter: number, quotaExceeded: boolean) => void;
  /** If true, skip events already in state.sessions. */
  skipSeen?: boolean;
  resolveProjectId?: (workspace: string) => Promise<string | null>;
  verbose?: boolean;
}

export interface ProcessHooksResult {
  sent: number;
  failed: number;
  skipped: number;
  state: State;
}

/**
 * `workspace` is `workspace_roots[0]` from the on-disk hooks queue — an
 * arbitrary JSON string. A plain prefix match would accept
 * `<scopeDir>/../../elsewhere` (AIX-547).
 */
function isUnderScopeDir(workspace: string, scopeDir: string): boolean {
  const normalized = normalizeRepoPathCandidate(workspace);
  return normalized !== null && isRepoPathWithinRoot(normalized, scopeDir);
}

/**
 * The forwarder redacts the home directory to "~" in workspace_roots for
 * privacy in the on-disk queue. Expand it back to an absolute path here so
 * scopeDir comparison and git-remote project resolution operate on a real
 * filesystem path. The payload's metadata.workspace stays redacted (the mapper
 * reads event.workspace_roots directly).
 */
function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function workspaceFromEvent(event: HookLogEvent): string {
  if (Array.isArray(event.workspace_roots) && typeof event.workspace_roots[0] === "string") {
    return expandHome(event.workspace_roots[0] as string);
  }
  return "";
}

/**
 * Rewrite the queue file keeping only the lines at the given indices.
 * Uses atomic rename to avoid corruption if the process is interrupted.
 */
function rewriteQueueKeepingLines(queuePath: string, allLines: string[], keepIndices: Set<number>): void {
  const remaining = allLines.filter((_, i) => keepIndices.has(i));
  const tmp = join(tmpdir(), `db90-hooks-queue-${randomBytes(6).toString("hex")}.ndjson`);
  writeFileSync(tmp, remaining.length > 0 ? remaining.join("\n") + "\n" : "", "utf-8");
  renameSync(tmp, queuePath);
}

/**
 * Read the hooks queue, POST new events, and atomically rewrite the queue
 * keeping only lines that failed to send (for retry on next cycle).
 *
 * Partial failure: lines that succeeded are removed; lines that failed stay.
 */
export async function processHooksQueue(
  params: ProcessHooksQueueParams
): Promise<ProcessHooksResult> {
  const {
    queuePath,
    scopeDir,
    host,
    token,
    allowInsecureHttp = false,
    on429,
    skipSeen = true,
    resolveProjectId,
    verbose = false,
  } = params;

  if (!existsSync(queuePath)) {
    return { sent: 0, failed: 0, skipped: 0, state: params.state };
  }

  // Single read — avoids a race window where the forwarder appends between two
  // separate readFileSync calls, which would cause newly-appended events to be
  // silently dropped during the queue rewrite.
  const rawContent = readFileSync(queuePath, "utf-8");
  const rawLines = rawContent.split("\n").filter((l) => l.trim().length > 0);

  const allEvents: HookLogEvent[] = rawLines.map((line) => {
    try {
      return JSON.parse(line) as HookLogEvent;
    } catch {
      return { hook_event_name: "log_parse_error" } as HookLogEvent;
    }
  });

  if (allEvents.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, state: params.state };
  }

  let stateMut = params.state;
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failedIndices = new Set<number>();

  for (let i = 0; i < allEvents.length; i++) {
    const event = allEvents[i];

    if (!shouldIngestHookEvent(event, verbose)) {
      totalSkipped++;
      continue;
    }

    warnOnCursorVersion(event, verbose);

    const workspace = workspaceFromEvent(event);

    if (scopeDir && workspace && !isUnderScopeDir(workspace, scopeDir)) {
      if (verbose) {
        console.log(
          `[verbose][cursor-hooks] Skipping event — workspace=${workspace} not under scopeDir=${scopeDir}`
        );
      }
      totalSkipped++;
      continue;
    }

    const dedupeKey = hookDedupeKey(event);

    if (skipSeen && stateMut.sessions[dedupeKey]) {
      totalSkipped++;
      continue;
    }

    let projectId: string | null | undefined;
    if (resolveProjectId && workspace) {
      projectId = await resolveProjectId(workspace);
    }

    const payload = mapHookEventToPayload(event, projectId);

    const ok = await postEvent(payload, host, token, { on429, allowInsecureHttp });

    if (ok) {
      totalSent++;
      stateMut = markSessionSent(stateMut, dedupeKey, 0);
    } else {
      totalFailed++;
      failedIndices.add(i);
      mcpLog.error(
        "sync_ingest_final_failure",
        { tool: "cursor", group: "cursor_hook", occurred_at: payload.occurred_at },
        true
      );
    }
  }

  // Rewrite queue: keep only lines that failed to send (retry next cycle)
  if (allEvents.length > 0) {
    rewriteQueueKeepingLines(queuePath, rawLines, failedIndices);
  }

  mcpLog.info(
    "cursor_hook_sync_complete",
    { sent: totalSent, failed: totalFailed, skipped: totalSkipped },
    verbose
  );

  return { sent: totalSent, failed: totalFailed, skipped: totalSkipped, state: stateMut };
}
