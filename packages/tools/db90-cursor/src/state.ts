import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";

export interface State {
  lastProcessedAt: string | null;
  /** Max `occurred_at` of successfully-sent recent-commit events (ms precision, not day-bucket). */
  lastRecentCommitAt?: string | null;
  /** All `metadata.commit_hash` values successfully POSTed for Path B across all workspace DBs. */
  lastRecentCommitHashes?: string[];
}

export const APP_DIR = join(homedir(), ".db90-cursor");

/**
 * Derives a per-credential filename stem.
 * Format: `state-<hostname>-<12-char token hash>`
 * Example: `state-app.db90.io-a1b2c3d4e5f6.json`
 */
export function stateKey(host: string, token: string): string {
  let hostname: string;
  try {
    hostname = new URL(host).hostname;
  } catch {
    hostname = host.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 40);
  }
  const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 12);
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

function parseState(raw: unknown): State | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.lastProcessedAt !== "string" && p.lastProcessedAt !== null) return null;

  const lastRecentCommitAt =
    typeof p.lastRecentCommitAt === "string" || p.lastRecentCommitAt === null
      ? (p.lastRecentCommitAt as string | null)
      : undefined;

  const lastRecentCommitHashes = Array.isArray(p.lastRecentCommitHashes)
    ? (p.lastRecentCommitHashes as string[]).filter((h) => typeof h === "string")
    : undefined;

  return {
    lastProcessedAt: p.lastProcessedAt as string | null,
    lastRecentCommitAt,
    lastRecentCommitHashes,
  };
}

/**
 * One-time migration: if a legacy `state.json` exists but no credential-scoped
 * file does, rename it so existing watermarks are not lost on upgrade.
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
    const parsed = parseState(JSON.parse(readFileSync(filePath, "utf-8")) as unknown);
    if (parsed) return parsed;
  } catch {
    // missing or malformed state file — start fresh
  }
  return { lastProcessedAt: null };
}

/** Atomic write: write to a temp file then rename over the target. */
export function writeState(state: State, dir?: string, host?: string, token?: string): void {
  const stateDir = dir ?? APP_DIR;
  mkdirSync(stateDir, { recursive: true });

  const finalPath = stateFilePath(stateDir, host, token);
  const tmpPath = join(tmpdir(), `db90-cursor-state-${randomBytes(6).toString("hex")}.json`);

  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, finalPath);
}
