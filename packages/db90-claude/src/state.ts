import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";

export interface SessionRecord {
  /** File size in bytes when this session was last successfully sent. */
  fileSize: number;
  /** ISO timestamp when this session was sent. */
  sentAt: string;
}

export interface State {
  version: number;
  /** Map of session ID → last known state. */
  sessions: Record<string, SessionRecord>;
}

export const APP_DIR = join(homedir(), ".db90-claude");

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
  const filePath = stateFilePath(dir ?? APP_DIR, host, token);
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      if (
        typeof p.version === "number" &&
        typeof p.sessions === "object" &&
        p.sessions !== null
      ) {
        return {
          version: p.version,
          sessions: p.sessions as Record<string, SessionRecord>,
        };
      }
    }
  } catch {
    // missing or malformed state file — start fresh
  }
  return { version: 1, sessions: {} };
}

/** Atomic write: write to a temp file then rename over the target. */
export function writeState(state: State, dir?: string, host?: string, token?: string): void {
  const stateDir = dir ?? APP_DIR;
  mkdirSync(stateDir, { recursive: true });

  const finalPath = stateFilePath(stateDir, host, token);
  const tmpPath = join(tmpdir(), `db90-claude-state-${randomBytes(6).toString("hex")}.json`);

  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, finalPath);
}

export function markSessionSent(
  state: State,
  sessionId: string,
  fileSize: number
): State {
  return {
    ...state,
    sessions: {
      ...state.sessions,
      [sessionId]: { fileSize, sentAt: new Date().toISOString() },
    },
  };
}
