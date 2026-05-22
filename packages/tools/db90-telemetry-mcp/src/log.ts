import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getAppDir } from "./state.js";

/** Active log file is capped; overflow rotates to `mcp.log.1`. */
export const MCP_LOG_MAX_BYTES = 5 * 1024 * 1024;

const LOG_BASENAME = "mcp.log";
const ROTATED_BASENAME = "mcp.log.1";

export function getMcpLogPath(appDir?: string): string {
  return join(appDir ?? getAppDir(), LOG_BASENAME);
}

function formatLine(
  level: "info" | "warn" | "error",
  event: string,
  fields?: Record<string, unknown>
): string {
  const base: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  };
  if (fields && Object.keys(fields).length > 0) {
    base["data"] = fields;
  }
  return JSON.stringify(base);
}

function rotateIfNeeded(logPath: string, incomingByteLength: number): void {
  if (!existsSync(logPath)) return;
  const size = statSync(logPath).size;
  if (size + incomingByteLength <= MCP_LOG_MAX_BYTES) return;

  const rotated = join(dirname(logPath), ROTATED_BASENAME);
  if (existsSync(rotated)) {
    unlinkSync(rotated);
  }
  renameSync(logPath, rotated);
}

/**
 * Append one UTF-8 line to `mcp.log` under the app dir (`DB90_MCP_HOME` or `~/.db90-mcp`).
 * Rotates when the file would exceed {@link MCP_LOG_MAX_BYTES}.
 */
export function appendMcpLogLine(line: string, appDir?: string): void {
  const dir = appDir ?? getAppDir();
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, LOG_BASENAME);
  const raw = Buffer.from(`${line}\n`, "utf8");
  const buf =
    raw.length > MCP_LOG_MAX_BYTES
      ? Buffer.concat([raw.subarray(0, MCP_LOG_MAX_BYTES - 1), Buffer.from("\n")])
      : raw;
  rotateIfNeeded(logPath, buf.length);
  appendFileSync(logPath, buf);
}

function emit(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> | undefined,
  mirrorToConsole: boolean
): void {
  const line = formatLine(level, event, fields);
  try {
    appendMcpLogLine(line);
  } catch (err) {
    /* best-effort — never break sync for logging */
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[db90-mcp] failed to append mcp.log: ${msg}`);
  }
  if (mirrorToConsole) {
    const suffix = fields ? ` ${JSON.stringify(fields)}` : "";
    const prefix = `[db90-mcp][${level}] ${event}`;
    if (level === "info") console.log(prefix + suffix);
    else if (level === "warn") console.warn(prefix + suffix);
    else console.error(prefix + suffix);
  }
}

/** Structured MCP operational log (file + optional stderr mirror for operators). */
export const mcpLog = {
  info(event: string, fields?: Record<string, unknown>, mirrorToConsole = false): void {
    emit("info", event, fields, mirrorToConsole);
  },
  warn(event: string, fields?: Record<string, unknown>, mirrorToConsole = true): void {
    emit("warn", event, fields, mirrorToConsole);
  },
  error(event: string, fields?: Record<string, unknown>, mirrorToConsole = true): void {
    emit("error", event, fields, mirrorToConsole);
  },
};
