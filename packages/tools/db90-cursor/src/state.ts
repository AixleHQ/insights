import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface State {
  lastProcessedAt: string | null;
}

export const APP_DIR = join(homedir(), ".db90-cursor");

function stateFilePath(dir: string): string {
  return join(dir, "state.json");
}

export function readState(dir?: string): State {
  const filePath = stateFilePath(dir ?? APP_DIR);
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      if (typeof p.lastProcessedAt === "string" || p.lastProcessedAt === null) {
        return { lastProcessedAt: p.lastProcessedAt as string | null };
      }
    }
    return { lastProcessedAt: null };
  } catch {
    return { lastProcessedAt: null };
  }
}

export function writeState(state: State, dir?: string): void {
  const stateDir = dir ?? APP_DIR;
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFilePath(stateDir), JSON.stringify(state, null, 2), "utf-8");
}
