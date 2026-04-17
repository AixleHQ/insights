import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

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

function stateFilePath(dir: string): string {
  return join(dir, "state.json");
}

export function readState(dir?: string): State {
  const filePath = stateFilePath(dir ?? APP_DIR);
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
export function writeState(state: State, dir?: string): void {
  const stateDir = dir ?? APP_DIR;
  mkdirSync(stateDir, { recursive: true });

  const finalPath = stateFilePath(stateDir);
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
