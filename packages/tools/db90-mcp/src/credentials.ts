import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "./state.js";

export interface Credentials {
  token: string;
  host: string;
}

/**
 * Loads `credentials.json` from the MCP app directory (default `~/.db90-mcp`).
 * Shape: `{ "token": "db90_...", "host": "http://localhost:3000" }`
 */
export function loadCredentials(appDir: string = getAppDir()): Credentials | null {
  const filePath = join(appDir, "credentials.json");
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    const token = o.token;
    const host = o.host;
    if (typeof token === "string" && token.length > 0 && typeof host === "string" && host.length > 0) {
      return { token, host };
    }
  } catch {
    // malformed
  }
  return null;
}
