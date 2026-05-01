import { mkdirSync, statSync, renameSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const APP_DIR = join(homedir(), ".db90-mcp");
const LOG_FILE = join(APP_DIR, "mcp.log");
const ROTATE_AT_BYTES = 5 * 1024 * 1024;

function ensureAppDir(): void {
  mkdirSync(APP_DIR, { recursive: true });
}

function rotateIfNeeded(): void {
  if (!existsSync(LOG_FILE)) return;
  const size = statSync(LOG_FILE).size;
  if (size < ROTATE_AT_BYTES) return;
  renameSync(LOG_FILE, `${LOG_FILE}.1`);
}

export function log(level: "info" | "warn" | "error", message: string): void {
  ensureAppDir();
  rotateIfNeeded();
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  appendFileSync(LOG_FILE, line, { encoding: "utf8" });
}

const RING_CAPACITY = 10;
const errorRing: { at: string; message: string }[] = [];

export function recordError(message: string): void {
  errorRing.push({ at: new Date().toISOString(), message });
  if (errorRing.length > RING_CAPACITY) errorRing.shift();
  log("error", message);
}

export function recentErrors(): { at: string; message: string }[] {
  return [...errorRing];
}
