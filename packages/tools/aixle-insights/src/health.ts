import type { TelemetryToolId, StoredCredentials } from "./auth/credentials.js";
import { loadCredentials, credentialsHaveAnyToken } from "./credentials.js";
import {
  readState,
  getAppDir,
  credentialStateFilePath,
  type McpOperatorState,
  type SyncResultSnapshot,
} from "./state.js";
import { getSyncTelemetry, type SyncResult } from "./sync.js";
import { getMcpLogPath } from "./log.js";
import { verifyHooksConfig } from "./hooks/hooks-config.js";

export interface HealthSnapshot {
  authenticated: boolean;
  configured: boolean;
  host: string | null;
  ingest_tools: TelemetryToolId[];
  app_dir: string;
  log_path: string;
  state_file_paths: string[];
  state_tracked_sessions: number;
  /** Whether the Cursor hooks forwarder is installed in ~/.cursor/hooks.json. */
  hooks_installed: boolean;
  /** Number of unprocessed events waiting in the hooks queue file. */
  hooks_queue_depth: number;
  /** Best-effort merge of credential-scoped `mcp_operator` (latest `last_sync_at`). */
  persisted: McpOperatorState | null;
  /** In-process telemetry (same fields as `getSyncTelemetry`). */
  process: {
    last_sync_at: string | null;
    last_result: SyncResult | null;
    recent_errors: string[];
  };
}

function snapshotToResult(s: SyncResultSnapshot | null): SyncResult | null {
  if (!s) return null;
  return {
    sent: s.sent,
    failed: s.failed,
    skipped: s.skipped,
    locked: s.locked,
    errors: s.errors,
    rateLimitedUntil: s.rate_limited_until ?? undefined,
  };
}

function mergeErrors(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= 20) break;
  }
  return out;
}

/** Pick the freshest persisted operator block by `last_sync_at` lexicographic (ISO-safe). */
export function mergePersistedOperators(snapshots: McpOperatorState[]): McpOperatorState | null {
  if (snapshots.length === 0) return null;
  let best = snapshots[0]!;
  for (const s of snapshots.slice(1)) {
    const a = best.last_sync_at ?? "";
    const b = s.last_sync_at ?? "";
    if (b > a) best = s;
  }
  return best;
}

function collectPersistedAndPaths(
  appDir: string,
  host: string,
  creds: StoredCredentials
): { paths: string[]; merged: McpOperatorState | null; tracked: number } {
  const seenTok = new Set<string>();
  const blocks: McpOperatorState[] = [];
  const paths: string[] = [];
  let tracked = 0;

  for (const tok of Object.values(creds.accounts)) {
    if (typeof tok !== "string" || tok.length === 0 || seenTok.has(tok)) continue;
    seenTok.add(tok);
    paths.push(credentialStateFilePath(appDir, host, tok));
    const st = readState(appDir, host, tok);
    tracked += Object.keys(st.sessions).length;
    if (st.mcp_operator) blocks.push(st.mcp_operator);
  }

  return { paths, merged: mergePersistedOperators(blocks), tracked };
}

export async function buildHealthSnapshot(): Promise<HealthSnapshot> {
  const appDir = getAppDir();
  const logPath = getMcpLogPath(appDir);
  const telemetry = getSyncTelemetry();

  const hooksReport = verifyHooksConfig(appDir);

  try {
    const creds = await loadCredentials();
    if (!creds || !credentialsHaveAnyToken(creds)) {
      return {
        authenticated: false,
        configured: false,
        host: null,
        ingest_tools: [],
        app_dir: appDir,
        log_path: logPath,
        state_file_paths: [],
        state_tracked_sessions: 0,
        hooks_installed: hooksReport.hooks_json_installed,
        hooks_queue_depth: hooksReport.queue_depth,
        persisted: null,
        process: {
          last_sync_at: telemetry.lastSyncAt,
          last_result: telemetry.lastResult,
          recent_errors: telemetry.recentErrors,
        },
      };
    }

    const ingest_tools = (
      Object.entries(creds.accounts) as [TelemetryToolId, string | undefined][]
    )
      .filter(([, tok]) => typeof tok === "string" && tok.length > 0)
      .map(([k]) => k)
      .sort();

    const { paths, merged, tracked } = collectPersistedAndPaths(appDir, creds.host, creds);

    return {
      authenticated: true,
      configured: true,
      host: creds.host,
      ingest_tools,
      app_dir: appDir,
      log_path: logPath,
      state_file_paths: paths.sort(),
      state_tracked_sessions: tracked,
      hooks_installed: hooksReport.hooks_json_installed,
      hooks_queue_depth: hooksReport.queue_depth,
      persisted: merged,
      process: {
        last_sync_at: telemetry.lastSyncAt,
        last_result: telemetry.lastResult,
        recent_errors: telemetry.recentErrors,
      },
    };
  } catch (err) {
    return {
      authenticated: false,
      configured: false,
      host: null,
      ingest_tools: [],
      app_dir: appDir,
      log_path: logPath,
      state_file_paths: [],
      state_tracked_sessions: 0,
      hooks_installed: hooksReport.hooks_json_installed,
      hooks_queue_depth: hooksReport.queue_depth,
      persisted: null,
      process: {
        last_sync_at: telemetry.lastSyncAt,
        last_result: telemetry.lastResult,
        recent_errors: [
          ...telemetry.recentErrors,
          err instanceof Error ? err.message : String(err),
        ].slice(-20),
      },
    };
  }
}

/** MCP `db90_status` JSON — single source shared with CLI health. */
export function healthSnapshotToStatusPayload(snapshot: HealthSnapshot): Record<string, unknown> {
  const proc = snapshot.process;
  const pers = snapshot.persisted;

  const lastSyncAt = proc.last_sync_at ?? pers?.last_sync_at ?? null;
  const lastResult = proc.last_result ?? snapshotToResult(pers?.last_result ?? null);

  const errors = mergeErrors(proc.recent_errors, pers?.recent_errors ?? []);

  return {
    authenticated: snapshot.authenticated,
    configured: snapshot.configured,
    host: snapshot.host,
    ingest_tools: snapshot.ingest_tools,
    last_sync_at: lastSyncAt,
    last_result: lastResult,
    sessions_synced: lastResult?.sent ?? 0,
    skipped: lastResult?.skipped ?? 0,
    state_tracked_sessions: snapshot.state_tracked_sessions,
    errors,
    app_dir: snapshot.app_dir,
    log_path: snapshot.log_path,
    state_file_paths: snapshot.state_file_paths,
    persisted_operator: pers,
  };
}

export function formatHealthForCli(snapshot: HealthSnapshot): string {
  const lines: string[] = ["db90-mcp health diagnostic", ""];
  lines.push(`app_dir: ${snapshot.app_dir}`);
  lines.push(`log_path: ${snapshot.log_path}`);
  lines.push(`authenticated: ${snapshot.authenticated}`);
  lines.push(`configured: ${snapshot.configured}`);
  lines.push(`host: ${snapshot.host ?? "(none)"}`);
  lines.push(`ingest_tools: ${snapshot.ingest_tools.length ? snapshot.ingest_tools.join(", ") : "(none)"}`);
  lines.push(`state_file_paths:`);
  if (snapshot.state_file_paths.length === 0) {
    lines.push("  (none — no credential-scoped state files yet)");
  } else {
    for (const p of snapshot.state_file_paths) {
      lines.push(`  - ${p}`);
    }
  }

  const sta = healthSnapshotToStatusPayload(snapshot);
  lines.push("");
  lines.push(`last_sync_at: ${String(sta["last_sync_at"] ?? "null")}`);
  lines.push(`last_result: ${JSON.stringify(sta["last_result"] ?? null)}`);
  lines.push(`state_tracked_sessions: ${String(snapshot.state_tracked_sessions)}`);
  lines.push(`persisted_operator: ${JSON.stringify(snapshot.persisted)}`);

  const err = sta["errors"];
  lines.push("");
  lines.push(
    `recent_errors (${Array.isArray(err) ? err.length : 0}):`
  );
  if (Array.isArray(err) && err.length > 0) {
    for (const e of err) {
      lines.push(`  - ${e}`);
    }
  } else {
    lines.push("  (none)");
  }

  return lines.join("\n");
}
