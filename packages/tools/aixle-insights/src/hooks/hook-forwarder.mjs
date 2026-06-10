#!/usr/bin/env node
/**
 * AIX-286 — append redacted Cursor hook stdin to the db90-mcp hooks queue.
 * Cursor invokes this via ~/.cursor/hooks.json on sessionEnd / postToolUse.
 * No credentials here — telemetry-mcp reads the queue and POSTs on the next sync cycle.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_APP_DIR = join(homedir(), ".db90-mcp");

/**
 * Resolve the app dir. Cursor's hooks.json has no `env` support, so the
 * installer passes `--app-dir <path>` in the command string. Precedence:
 * CLI arg → DB90_MCP_HOME env → default (~/.db90-mcp).
 */
function getAppDir() {
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf("--app-dir");
  if (flagIdx !== -1 && typeof argv[flagIdx + 1] === "string" && argv[flagIdx + 1].trim()) {
    return argv[flagIdx + 1].trim();
  }
  return process.env.DB90_MCP_HOME?.trim() || DEFAULT_APP_DIR;
}

function getQueuePath() {
  return join(getAppDir(), "hooks-queue.ndjson");
}

function redactPath(p) {
  if (typeof p !== "string") return p;
  return p.replaceAll(homedir(), "~");
}

function redactValue(key, value) {
  if (value === null || value === undefined) return value;

  if (key === "user_email") return "[redacted]";
  if (key === "transcript_path") {
    return typeof value === "string" ? "[redacted]" : value;
  }
  if (key === "workspace_roots" && Array.isArray(value)) {
    return value.map((r) => redactPath(String(r)));
  }
  if (
    key === "tool_input" ||
    key === "tool_output" ||
    key === "text" ||
    key === "agent_message" ||
    key === "error_message" ||
    key === "command"
  ) {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return `[redacted, ${s.length} chars]`;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return value;
}

function redactHookPayload(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const input = await readStdin();
  const queuePath = getQueuePath();

  let payload;
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    payload = { hook_event_name: "parse_error", raw_length: input.length };
  }

  const entry = {
    captured_at: new Date().toISOString(),
    ...redactHookPayload(payload),
  };

  mkdirSync(dirname(queuePath), { recursive: true });
  appendFileSync(queuePath, `${JSON.stringify(entry)}\n`, "utf-8");

  // Cursor requires an empty JSON object response from hook scripts.
  process.stdout.write("{}");
}

main().catch((err) => {
  console.error(`[db90-hook-forwarder] ${err instanceof Error ? err.message : String(err)}`);
  process.stdout.write("{}");
  process.exit(0);
});
