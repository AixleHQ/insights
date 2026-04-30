import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "./log.js";

const STATE_FILE = join(APP_DIR, "state.json");

export interface McpState {
  version: 1;
  auth: {
    lastRefreshedAt: string | null;
  };
  lastSyncAt: string | null;
  errorsCount: number;
}

const EMPTY_STATE: McpState = {
  version: 1,
  auth: { lastRefreshedAt: null },
  lastSyncAt: null,
  errorsCount: 0,
};

export function loadState(): McpState {
  if (!existsSync(STATE_FILE)) return { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_STATE };
    const obj = parsed as Partial<McpState>;
    return {
      version: 1,
      auth: { lastRefreshedAt: obj.auth?.lastRefreshedAt ?? null },
      lastSyncAt: obj.lastSyncAt ?? null,
      errorsCount: obj.errorsCount ?? 0,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(state: McpState): void {
  mkdirSync(APP_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { encoding: "utf8" });
}
