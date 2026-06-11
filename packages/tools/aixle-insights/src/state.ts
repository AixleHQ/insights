import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";

export interface SessionRecord {
  /** File size in bytes when this session was last successfully sent. */
  fileSize: number;
  /** ISO timestamp when this session was sent. */
  sentAt: string;
  /** SHA-256 prefix (32 hex chars) of the transcript file at time of send — preferred over fileSize for change detection. */
  contentHash?: string;
}

/** Persisted summary of the last sync run (for CLI/MCP health across processes). */
export interface SyncResultSnapshot {
  sent: number;
  failed: number;
  skipped: number;
  locked?: boolean;
  rate_limited_until?: string | null;
  errors?: string[];
}

/** Operator-facing metadata stored beside checkpoint `sessions` (same credential-scoped file). */
export interface McpOperatorState {
  last_sync_at: string | null;
  last_result: SyncResultSnapshot | null;
  recent_errors: string[];
}

export interface State {
  version: number;
  /**
   * Map of session ID → last known state.
   * Key namespaces:
   *   `claude_code:<sessionId>` — Claude transcript turns
   *   `cursor:watermark` / `cursor:events:watermark` / etc. — Cursor timestamp watermarks
   *   `cursor:hook:<conversation_id>:<generation_id>:<hook_event_name>` — Cursor hook event dedup (AIX-286)
   */
  sessions: Record<string, SessionRecord>;
  /**
   * All `metadata.commit_hash` values successfully POSTed for Cursor Path B (recent commit).
   * Hash dedupe is authoritative; timestamp watermarks alone
   * can block retries after ingest accepted 202 but failed to persist.
   */
  lastRecentCommitHashes?: string[];
  /**
   * ISO timestamp: suspend sync for this credential until this time (persisted 429 backoff).
   * Primed into the in-memory backoff map on startup so rate-limits survive process restarts.
   */
  rate_limited_until?: string | null;
  /** Optional MCP diagnostics for health / debugging (does not replace session checkpoints). */
  mcp_operator?: McpOperatorState;
}

export function getAppDir(): string {
  const override = process.env["AIXLE_INSIGHTS_HOME"]?.trim();
  if (override && override.length > 0) return override;
  return join(homedir(), ".aixle-insights");
}

/**
 * Derives a per-credential filename stem.
 * Format: `state-<hostname>-<8-char token hash>`
 * Example: `state-app.db90.io-a1b2c3d4.json`
 */
export function stateKey(host: string, token: string): string {
  let hostname: string;
  try {
    hostname = new URL(host).hostname;
  } catch {
    // host is not a valid URL — sanitise for use as a filename component
    hostname = host.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 40);
  }
  const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 8);
  return `state-${hostname}-${tokenHash}`;
}

function stateFilePath(dir: string, host?: string, token?: string): string {
  const filename = host && token ? `${stateKey(host, token)}.json` : "state.json";
  return join(dir, filename);
}

/** Absolute path to the credential-scoped state JSON on disk. */
export function credentialStateFilePath(dir: string, host: string, token: string): string {
  return stateFilePath(dir, host, token);
}

function parseMcpOperator(raw: unknown): McpOperatorState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;

  let lastSyncAt: string | null = null;
  if (o.last_sync_at === null) lastSyncAt = null;
  else if (typeof o.last_sync_at === "string") lastSyncAt = o.last_sync_at;

  let lastResult: SyncResultSnapshot | null = null;
  if (o.last_result === null) {
    lastResult = null;
  } else if (typeof o.last_result === "object" && o.last_result !== null) {
    const r = o.last_result as Record<string, unknown>;
    if (
      typeof r.sent === "number" &&
      typeof r.failed === "number" &&
      typeof r.skipped === "number"
    ) {
      lastResult = {
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
        locked: typeof r.locked === "boolean" ? r.locked : undefined,
        rate_limited_until:
          r.rate_limited_until === null || typeof r.rate_limited_until === "string"
            ? (r.rate_limited_until as string | null)
            : undefined,
        errors: Array.isArray(r.errors)
          ? r.errors.filter((e): e is string => typeof e === "string")
          : undefined,
      };
    }
  }

  const recentErrors: string[] = Array.isArray(o.recent_errors)
    ? o.recent_errors.filter((e): e is string => typeof e === "string")
    : [];

  return {
    last_sync_at: lastSyncAt,
    last_result: lastResult,
    recent_errors: recentErrors,
  };
}

/**
 * One-time migration: if a legacy `state.json` exists but no credential-scoped
 * file does, rename it to the new name so existing sessions are not re-sent on
 * the first upgrade run. No-op when the new file already exists or no legacy
 * file is present.
 */
export function migrateLegacyState(dir: string, host: string, token: string): void {
  const legacyPath = join(dir, "state.json");
  const newPath = stateFilePath(dir, host, token);
  if (existsSync(legacyPath) && !existsSync(newPath)) {
    renameSync(legacyPath, newPath);
  }
}

export function readState(dir?: string, host?: string, token?: string): State {
  const filePath = stateFilePath(dir ?? getAppDir(), host, token);
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      if (
        typeof p.version === "number" &&
        typeof p.sessions === "object" &&
        p.sessions !== null
      ) {
        const lastRecentCommitHashes = Array.isArray(p.lastRecentCommitHashes)
          ? (p.lastRecentCommitHashes as string[]).filter((h) => typeof h === "string")
          : undefined;
        const out: State = {
          version: p.version,
          sessions: p.sessions as Record<string, SessionRecord>,
        };
        if (lastRecentCommitHashes !== undefined) {
          out.lastRecentCommitHashes = lastRecentCommitHashes;
        }
        if ("mcp_operator" in p) {
          const mcp = parseMcpOperator(p.mcp_operator);
          if (mcp) out.mcp_operator = mcp;
        }
        if ("rate_limited_until" in p) {
          if (typeof p.rate_limited_until === "string") {
            out.rate_limited_until = p.rate_limited_until;
          } else if (p.rate_limited_until === null) {
            out.rate_limited_until = null;
          }
        }
        return out;
      }
    }
  } catch {
    // missing or malformed state file — start fresh
  }
  return { version: 1, sessions: {} };
}

/** Atomic write: write to a temp file then rename over the target. */
export function writeState(state: State, dir?: string, host?: string, token?: string): void {
  const stateDir = dir ?? getAppDir();
  mkdirSync(stateDir, { recursive: true });

  const finalPath = stateFilePath(stateDir, host, token);
  const tmpPath = join(stateDir, `.tmp-${randomBytes(6).toString("hex")}.json`);

  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, finalPath);
}

export function markSessionSent(
  state: State,
  sessionId: string,
  fileSize: number,
  contentHash?: string
): State {
  const record: SessionRecord = { fileSize, sentAt: new Date().toISOString() };
  if (contentHash !== undefined) record.contentHash = contentHash;
  return {
    ...state,
    sessions: {
      ...state.sessions,
      [sessionId]: record,
    },
  };
}

/** Merge operator snapshot into an existing state object before `writeState`. */
export function withMcpOperator(state: State, operator: McpOperatorState): State {
  return { ...state, mcp_operator: operator };
}
