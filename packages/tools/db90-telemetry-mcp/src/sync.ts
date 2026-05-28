import type { TelemetryToolId, StoredCredentials } from "./auth/credentials.js";
import { execFileSync } from "node:child_process";
import {
  readState,
  writeState,
  markSessionSent,
  getAppDir,
  stateKey as credentialStateKey,
  migrateLegacyState,
  withMcpOperator,
  type McpOperatorState,
  type SyncResultSnapshot,
} from "./state.js";
import {
  findTranscriptFiles,
  parseTranscriptFile,
  mapTranscriptTurn as mapClaudeTranscriptTurn,
  type ClaudeTranscriptTurn,
} from "./readers/claude.js";
import {
  readEvents as readCursorEvents,
  readDailyStats,
  readRecentCommitSnapshots,
  readCursorTranscriptSessions,
  mapEvent as mapCursorEvent,
  mapTranscriptTurn as mapCursorTranscriptTurn,
  mapDailyStats,
  mapRecentCommit,
  DEFAULT_CURSOR_PRICING,
  type CursorTranscriptTurn,
  type CursorDb90Payload,
} from "./readers/cursor.js";
import { postEvent } from "./client.js";
import { type PricingTable, getCostWarning } from "./pricing.js";
import { acquireSyncLock } from "./lock.js";
import {
  canonicalizeGitRemote,
  enrichCommitProjectAttribution,
  lookupProjectByRemote,
  type ProjectResolution,
} from "@db90/sdk";
import { mcpLog } from "./log.js";

/** Prefix for Claude Code session keys in shared MCP state. */
export const CLAUDE_STATE_PREFIX = "claude_code:" as const;

/** Cursor SQLite watermark checkpoints — never collide with Claude `claude_code:*` session keys. */
export const CURSOR_WATERMARK_KEY = "cursor:watermark" as const;
export const CURSOR_EVENTS_WATERMARK_KEY = "cursor:events_watermark" as const;
export const CURSOR_DAILY_STATS_WATERMARK_KEY = "cursor:daily_stats_watermark" as const;
export const CURSOR_RECENT_COMMIT_WATERMARK_KEY = "cursor:recent_commit_watermark" as const;
export const CURSOR_TRANSCRIPT_TURN_PREFIX = "cursor:transcript_turn:" as const;

export function sessionStateKey(sessionId: string): string {
  return `${CLAUDE_STATE_PREFIX}${sessionId}`;
}

export function cursorTranscriptTurnStateKey(turnId: string): string {
  return `${CURSOR_TRANSCRIPT_TURN_PREFIX}${turnId}`;
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
  projectIdSource?: ProjectResolution["source"];
  pricing: PricingTable;
  appDir?: string;
  transcriptBaseDirs?: string[];
  /**
   * When set, only Claude turns whose `cwd` matches this directory (exact or
   * subdirectory) are synced. All matching turns use `projectId` directly
   * — no per-turn remote lookup. Turns from other directories are skipped.
   * Typically set to `process.cwd()` so each MCP instance is scoped to the
   * repo it was launched from.
   */
  scopeDir?: string;
}

export interface MultiSyncOptions {
  credentials: StoredCredentials;
  dryRun: boolean;
  verbose: boolean;
  projectId: string | null;
  projectIdSource?: ProjectResolution["source"];
  /** Token for GET /projects/lookup (defaults to cursor ingest token in cursor slice). */
  projectLookupToken?: string | null;
  pricing: PricingTable;
  appDir?: string;
  transcriptBaseDirs?: string[];
  /** Synthetic Cursor paths for Vitest isolation. Omit for real installs. */
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  tools?: TelemetryToolId[];
  /** See SyncOptions.scopeDir. */
  scopeDir?: string;
}

const backoffUntilByCredential = new Map<string, Date>();

/** Clears in-memory rate-limit backoff (test hook). */
export function resetBackoffStateForTests(): void {
  backoffUntilByCredential.clear();
}

let lastSyncAt: string | null = null;
let lastSyncResult: SyncResult | null = null;
let recentErrors: string[] = [];

function syncResultToSnapshot(r: SyncResult): SyncResultSnapshot {
  return {
    sent: r.sent,
    failed: r.failed,
    skipped: r.skipped,
    locked: r.locked,
    rate_limited_until: r.rateLimitedUntil ?? null,
    errors: r.errors,
  };
}

function persistOperatorState(
  appDir: string,
  host: string,
  credentials: StoredCredentials,
  result: SyncResult,
  errors: string[],
  syncTimestamp: string
): void {
  const seen = new Set<string>();
  for (const tok of Object.values(credentials.accounts)) {
    if (typeof tok !== "string" || !tok.length || seen.has(tok)) continue;
    seen.add(tok);
    const st = readState(appDir, host, tok);
    let nextOp: McpOperatorState;
    if (result.locked) {
      const prev = st.mcp_operator;
      const lockMsg = "Sync skipped — another process holds the lock";
      nextOp = {
        last_sync_at: prev?.last_sync_at ?? null,
        last_result: prev?.last_result ?? null,
        recent_errors: [...(prev?.recent_errors ?? []), lockMsg].slice(-20),
      };
    } else {
      nextOp = {
        last_sync_at: syncTimestamp,
        last_result: syncResultToSnapshot(result),
        recent_errors:
          errors.length > 0 || result.failed > 0 ? errors.slice(-20) : [],
      };
    }
    writeState(withMcpOperator(st, nextOp), appDir, host, tok);
  }
}

export function getSyncTelemetry(): {
  lastSyncAt: string | null;
  lastResult: SyncResult | null;
  recentErrors: string[];
} {
  return { lastSyncAt, lastResult: lastSyncResult, recentErrors };
}

function recordTelemetry(
  result: SyncResult,
  errors: string[],
  persistCtx?: { appDir: string; host: string; credentials: StoredCredentials }
): void {
  const syncTimestamp = new Date().toISOString();
  if (!result.locked) {
    lastSyncAt = syncTimestamp;
    lastSyncResult = result;
  }
  if (result.locked) {
    recentErrors = [...recentErrors, "Sync skipped — another process holds the lock"].slice(-20);
  } else if (errors.length > 0 || result.failed > 0) {
    recentErrors = errors.slice(-20);
  } else {
    recentErrors = [];
  }

  if (persistCtx) {
    persistOperatorState(
      persistCtx.appDir,
      persistCtx.host,
      persistCtx.credentials,
      result,
      errors,
      syncTimestamp
    );
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

function explicitProjectId(
  projectId: string | null,
  projectIdSource?: ProjectResolution["source"]
): string | undefined {
  return projectId && (projectIdSource === "flag" || projectIdSource === "config")
    ? projectId
    : undefined;
}

async function resolveProjectIdForRepoPathCached(
  repoPath: string | undefined,
  host: string,
  token: string,
  verbose: boolean,
  cache: Map<string, string | null>
): Promise<string | null> {
  const normalized = repoPath?.trim();
  if (!normalized) return null;
  if (cache.has(normalized)) return cache.get(normalized) ?? null;

  let gitRemote: string | null = null;
  try {
    const out = execFileSync("git", ["-C", normalized, "remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    gitRemote = out || null;
  } catch {
    if (verbose) console.log(`[verbose] Could not determine git remote for path: ${normalized}`);
  }

  if (!gitRemote) {
    cache.set(normalized, null);
    return null;
  }

  const canonicalRemote = canonicalizeGitRemote(gitRemote, verbose);
  const result = await lookupProjectByRemote(canonicalRemote, host, token, verbose);
  const projectId = result && typeof result === "object" && "project_id" in result ? result.project_id : null;
  cache.set(normalized, projectId);
  return projectId;
}

function cursorRepoPathFromPayload(payload: CursorDb90Payload): string | undefined {
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  if (!metadata) return undefined;

  if (typeof metadata.workspace_folder === "string" && metadata.workspace_folder.length > 0) {
    return metadata.workspace_folder;
  }

  if (typeof metadata.transcript_source === "string" && typeof metadata.workspace === "string" && metadata.workspace.length > 0) {
    return metadata.workspace;
  }

  return undefined;
}

async function runClaudeSlice(options: SyncOptions): Promise<SyncResult> {
  const { token, host, dryRun, verbose, projectId, pricing } = options;
  const appDir = options.appDir ?? getAppDir();
  const backoffKey = credentialStateKey(host, token);
  const backoffUntil = backoffUntilByCredential.get(backoffKey) ?? null;
  const errors: string[] = [];

  if (backoffUntil && new Date() < backoffUntil) {
    const until = backoffUntil.toISOString();
    mcpLog.info("sync_rate_limit_skip", { tool: "claude_code", until }, verbose);
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
    mcpLog.info("sync_claude_transcripts", { files_found: files.length }, false);
  }

  const allFileTurns = await Promise.all(files.map((f) => parseTranscriptFile(f, verbose)));
  const bestTurns = new Map<string, ClaudeTranscriptTurn>();
  for (const fileTurns of allFileTurns) {
    for (const turn of fileTurns) {
      const existing = bestTurns.get(turn.turnId);
      if (!existing || turn.fileSize > existing.fileSize) {
        bestTurns.set(turn.turnId, turn);
      }
    }
  }

  const { scopeDir } = options;

  let state = readState(appDir, host, token);
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let shouldStopForBackoff = false;
  const explicitProject = explicitProjectId(projectId, options.projectIdSource);
  const projectLookupCache = new Map<string, string | null>();

  for (const turn of bestTurns.values()) {
    // When scopeDir is set, skip turns from other directories.
    if (scopeDir) {
      const cwd = turn.cwd?.trim();
      const inScope = cwd && (cwd === scopeDir || cwd.startsWith(scopeDir + "/"));
      if (!inScope) {
        totalSkipped++;
        if (verbose) {
          console.log(`[verbose] Skipping Claude turn ${turn.turnId} — cwd=${cwd ?? "(none)"} not under scopeDir=${scopeDir}`);
        }
        continue;
      }
    }

    const sKey = sessionStateKey(turn.turnId);
    const known = state.sessions[sKey];

    if (known) {
      totalSkipped++;
      if (verbose) {
        console.log(`[verbose] Skipping already-synced Claude turn ${turn.turnId}`);
      }
      mcpLog.info(
        "sync_checkpoint_skip",
        { tool: "claude_code", reason: "existing_turn_checkpoint", session_id: turn.turnId },
        false
      );
      continue;
    }

    // When scoped to a directory, use the pre-resolved projectId directly (the project
    // was already looked up from scopeDir's git remote). Skip per-turn network lookup.
    const resolvedProjectId = scopeDir
      ? (projectId ?? undefined)
      : (explicitProject ??
         (await resolveProjectIdForRepoPathCached(turn.cwd, host, token, verbose, projectLookupCache)) ??
         undefined);
    const payload = mapClaudeTranscriptTurn(turn, { projectId: resolvedProjectId, pricing });

    if (verbose && payload.cost_usd === null) {
      if (!turn.model) {
        if (turn.tokensIn > 0 || turn.tokensOut > 0) {
          console.warn(`[warn] Claude turn ${turn.turnId} has usage but no model — cost_usd will be null`);
        }
      } else {
        const warning = getCostWarning(turn.model, pricing);
        if (warning) console.warn(`[warn] ${warning}`);
      }
    }

    if (dryRun) {
      console.log(`[dry-run] Would send Claude turn ${turn.turnId}:`);
      console.log(JSON.stringify(payload, null, 2));
      totalSent++;
      continue;
    }

    if (verbose) {
      console.log(`[verbose] Sending Claude turn ${turn.turnId} (${turn.tokensIn + turn.tokensOut} tokens)`);
    }

    const ok = await postEvent(payload, host, token, {
      on429: (retryAfter, quotaExceeded) => {
        const currentBackoff = backoffUntilByCredential.get(backoffKey);
        const nextBackoff = new Date(Math.max(currentBackoff?.getTime() ?? 0, Date.now() + retryAfter * 1000));
        backoffUntilByCredential.set(backoffKey, nextBackoff);
        shouldStopForBackoff = true;
        const reason = quotaExceeded ? "Monthly quota exceeded" : "Rate limited";
        mcpLog.warn(
          "sync_rate_limit_pause",
          {
            tool: "claude_code",
            retry_until: nextBackoff.toISOString(),
            quota_exceeded: quotaExceeded,
          },
          true
        );
        console.warn(`[db90-mcp] ${reason}. Pausing until ${nextBackoff.toISOString()}.`);
      },
    });
    if (ok) {
      state = markSessionSent(state, sKey, turn.fileSize);
      writeState(state, appDir, host, token);
      totalSent++;
    } else {
      totalFailed++;
      errors.push(`Failed to post Claude turn ${turn.turnId}`);
      mcpLog.error("sync_ingest_final_failure", { tool: "claude_code", session_id: turn.turnId }, true);
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
  projectIdSource?: ProjectResolution["source"];
  projectLookupToken?: string | null;
  appDir: string;
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  scopeDir?: string;
}): Promise<SyncResult> {
  const {
    token,
    host,
    dryRun,
    verbose,
    projectId,
    projectIdSource,
    projectLookupToken,
    appDir,
    cursorBaseDir,
    cursorTranscriptProjectDirs,
    scopeDir,
  } = params;
  const backoffKey = credentialStateKey(host, token);
  const backoffUntil = backoffUntilByCredential.get(backoffKey) ?? null;

  if (backoffUntil && new Date() < backoffUntil) {
    const until = backoffUntil.toISOString();
    mcpLog.info("sync_rate_limit_skip", { tool: "cursor", until }, verbose);
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
  const explicitProject = explicitProjectId(projectId, projectIdSource);
  const projectLookupCache = new Map<string, string | null>();
  const eventsSince = cursorWatermarkDate(stateBefore, CURSOR_EVENTS_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const dailyStatsSince = cursorWatermarkDate(stateBefore, CURSOR_DAILY_STATS_WATERMARK_KEY, CURSOR_WATERMARK_KEY);
  const recentCommitSince = cursorWatermarkDate(
    stateBefore,
    CURSOR_RECENT_COMMIT_WATERMARK_KEY,
    CURSOR_WATERMARK_KEY
  );

  const baseDir = cursorBaseDir;
  const transcriptTurns = await readCursorTranscriptSessions(baseDir, cursorTranscriptProjectDirs, verbose);
  const rawEvents = readCursorEvents(eventsSince, baseDir, verbose);
  const dailyStats = readDailyStats(dailyStatsSince, baseDir, verbose);
  const recentCommitSnapshots = readRecentCommitSnapshots(recentCommitSince, baseDir, verbose);

  const projectIdOpt = explicitProject;
  const transcriptTurnsById = new Map<string, CursorTranscriptTurn>();
  for (const turn of transcriptTurns) {
    transcriptTurnsById.set(turn.turnId, turn);
  }
  const transcriptPayloads = [...transcriptTurnsById.values()]
    .filter((turn) => {
      const known = stateBefore.sessions[cursorTranscriptTurnStateKey(turn.turnId)];
      return !known || known.fileSize !== turn.fileSize;
    })
    .map((turn) => mapCursorTranscriptTurn(turn, projectIdOpt, DEFAULT_CURSOR_PRICING))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const skippedTranscriptCount = transcriptTurns.length - transcriptPayloads.length;
  const transcriptModeEnabled = transcriptTurnsById.size > 0;

  const mappedFromEvents = rawEvents
    .map(({ row, workspacePath }) => mapCursorEvent(row, workspacePath, projectIdOpt, DEFAULT_CURSOR_PRICING))
    .filter((e): e is CursorDb90Payload => e !== null)
    .filter((payload) => !transcriptModeEnabled || payload.event_type !== "chat");

  const mappedFromStats = dailyStats.flatMap((entry) =>
    mapDailyStats(entry, projectIdOpt, DEFAULT_CURSOR_PRICING)
  ).filter((payload) => !transcriptModeEnabled || payload.event_type !== "chat");

  const mappedFromCommits = recentCommitSnapshots
    .map((snapshot) => mapRecentCommit(snapshot, projectIdOpt, DEFAULT_CURSOR_PRICING))
    .filter((payload): payload is CursorDb90Payload => payload !== null)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const lookupToken = projectLookupToken ?? token;
  await enrichCommitProjectAttribution(mappedFromCommits, {
    projectIdSource,
    host,
    token: lookupToken,
    verbose,
  });

  if (scopeDir) {
    // Filter Cursor payloads to only those whose workspace matches scopeDir,
    // then assign the pre-resolved projectId to all of them.
    const inScope = (payload: CursorDb90Payload): boolean => {
      const ws = cursorRepoPathFromPayload(payload);
      if (!ws) return false;
      return ws === scopeDir || ws.startsWith(scopeDir + "/");
    };
    for (const arr of [transcriptPayloads, mappedFromEvents, mappedFromStats, mappedFromCommits]) {
      const out: CursorDb90Payload[] = [];
      for (const payload of arr) {
        if (inScope(payload)) {
          if (projectId) payload.project_id = projectId;
          else delete payload.project_id;
          out.push(payload);
        } else {
          if (verbose) {
            const ws = cursorRepoPathFromPayload(payload) ?? "(none)";
            console.log(`[verbose][cursor] Skipping payload — workspace=${ws} not under scopeDir=${scopeDir}`);
          }
        }
      }
      arr.length = 0;
      arr.push(...out);
    }
  } else if (!explicitProject) {
    const cursorPayloadGroups = [transcriptPayloads, mappedFromEvents, mappedFromStats];
    for (const payloads of cursorPayloadGroups) {
      for (const payload of payloads) {
        const repoPath = cursorRepoPathFromPayload(payload);
        const resolvedProjectId = await resolveProjectIdForRepoPathCached(
          repoPath,
          host,
          lookupToken,
          verbose,
          projectLookupCache
        );
        if (resolvedProjectId) payload.project_id = resolvedProjectId;
        else delete payload.project_id;
      }
    }
  }

  const groups: Array<{ key: string; label: string; payloads: CursorDb90Payload[] }> = [
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
  let totalSkipped = skippedTranscriptCount;
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
          mcpLog.warn(
            "sync_rate_limit_pause",
            {
              tool: "cursor",
              retry_until: nextBackoff.toISOString(),
              quota_exceeded: quotaExceeded,
            },
            true
          );
          console.warn(`[db90-mcp][cursor] ${reason}. Pausing until ${nextBackoff.toISOString()}.`);
        },
      });

      if (ok) {
        totalSent++;
        groupLastSentAt = payload.occurred_at;
        if (group.label === "transcripts") {
          const turnId = payload.metadata.session_id;
          const sourceTurn =
            typeof turnId === "string" ? transcriptTurnsById.get(turnId) : undefined;
          if (sourceTurn) {
            stateMut = markSessionSent(
              stateMut,
              cursorTranscriptTurnStateKey(sourceTurn.turnId),
              sourceTurn.fileSize
            );
            writeState(stateMut, appDir, host, token);
          }
        }
        continue;
      }

      totalFailed++;
      groupFailed = true;
      abortRemaining = true;
      errors.push(`Cursor sync (${group.label}): failed to post ${payload.occurred_at}`);
      mcpLog.error(
        "sync_ingest_final_failure",
        { tool: "cursor", group: group.label, occurred_at: payload.occurred_at },
        true
      );
      totalSkipped += group.payloads.length - payloadIndex - 1;
      break;
    }

    if (!groupFailed && groupLastSentAt !== null && group.label !== "transcripts") {
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
    mcpLog.warn("sync_lock_skip", { reason: "advisory_lock_held", app_dir: appDir }, true);
    return lockedResult;
  }

  try {
    const { credentials, dryRun, verbose, projectId, projectIdSource, projectLookupToken, pricing, scopeDir } =
      options;
    const host = credentials.host;

    const requested: TelemetryToolId[] = dedupeTools(options.tools ?? ["claude_code", "cursor"]);
    const missingRequested = requested.filter((t) => !credentials.accounts[t]);
    if (missingRequested.length > 0) {
      const errors = [`Missing credentials for requested tool(s): ${missingRequested.join(", ")}`];
      const failedResult: SyncResult = { sent: 0, failed: missingRequested.length, skipped: 0, errors };
      mcpLog.warn(
        "sync_tool_validation_failed",
        { missing_tools: missingRequested, requested_tools: requested },
        true
      );
      recordTelemetry(failedResult, errors, dryRun ? undefined : { appDir, host, credentials });
      return failedResult;
    }
    const withToken = requested.filter((t) => !!credentials.accounts[t]);

    if (withToken.length === 0) {
      const zero: SyncResult = { sent: 0, failed: 0, skipped: 0 };
      recordTelemetry(zero, [], dryRun ? undefined : { appDir, host, credentials });
      return zero;
    }

    mcpLog.info(
      "sync_cycle_start",
      { ingest_tools: withToken, requested_tools: requested, dry_run: dryRun },
      false
    );

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
          scopeDir,
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
          projectIdSource,
          projectLookupToken,
          appDir,
          cursorBaseDir: options.cursorBaseDir,
          cursorTranscriptProjectDirs: options.cursorTranscriptProjectDirs,
          scopeDir,
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

    recordTelemetry(merged, errorsAcc, dryRun ? undefined : { appDir, host, credentials });
    mcpLog.info(
      "sync_cycle_end",
      { sent: merged.sent, failed: merged.failed, skipped: merged.skipped },
      false
    );
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