#!/usr/bin/env node
/**
 * CUR-V13 — append redacted Cursor hook stdin to NDJSON log (no DB90 POST).
 * Cursor invokes this via ~/.cursor/hooks.json on sessionEnd / postToolUse.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_LOG = join(homedir(), ".cursor", "db90-hooks-feasibility.ndjson");

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
    key === "text" ||
    key === "tool_input" ||
    key === "tool_output" ||
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
  const logPath = process.env.DB90_HOOK_LOG ?? DEFAULT_LOG;

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

  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");

  // Fire-and-forget hooks: empty JSON object on stdout.
  process.stdout.write("{}");
}

main().catch((err) => {
  console.error(`[db90-hook-log] ${err instanceof Error ? err.message : String(err)}`);
  process.stdout.write("{}");
  process.exit(0);
});
