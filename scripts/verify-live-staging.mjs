#!/usr/bin/env node
/**
 * Verify live staging tracking parity for @aixle/insights.
 *
 * Mirrors the PR #246 verification flow but adapted for the @db90 → @aixle
 * rename. Packs the renamed package into a .tgz, invokes via npx (so the
 * actual published-tarball install path is exercised, not the dev-mode
 * dist/cli.js), runs a sentinel-tagged synthetic event through the sync
 * pipeline, polls the staging /events API, and asserts the row landed
 * with the expected attributes.
 *
 * Usage:
 *   node scripts/verify-live-staging.mjs                       # both tools
 *   node scripts/verify-live-staging.mjs --tool claude
 *   node scripts/verify-live-staging.mjs --tool cursor
 *   node scripts/verify-live-staging.mjs --sentinel CUSTOM_TAG # re-check
 *
 * Prerequisites:
 *   - ~/.aixle-insights/credentials.json (run `aixle-insights init` first)
 *   - The credentials must belong to org 9719863e-b532-4aae-bb41-d04a3a1fa623
 *     (Dualboot Partners) on insights.example.com.
 *
 * Exit codes:
 *   0  all selected tools verified — staging row found, attributes match
 *   1  setup failure (missing creds, npm pack failed)
 *   2  sync failed (CLI run --once returned non-zero or no POST observed)
 *   3  staging row never landed within the 60s poll budget
 *   4  staging row landed but attributes don't match the expected contract
 */

import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const PACKAGE_DIR = join(REPO_ROOT, "packages", "tools", "aixle-insights");
const TARBALL_NAME = "aixle-insights-0.1.0.tgz";
const TARBALL_PATH = join(PACKAGE_DIR, TARBALL_NAME);

const STAGING_HOST = "https://insights.example.com";
const STAGING_ORG = "9719863e-b532-4aae-bb41-d04a3a1fa623";
const CREDENTIALS_PATH = join(homedir(), ".aixle-insights", "credentials.json");

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 12; // 60s budget
const SYNC_TIMEOUT_MS = 30_000;

// ──────────────────────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def = null) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return def;
  return args[idx + 1] ?? def;
}

const TOOL = flag("tool", "both");
const SENTINEL_OVERRIDE = flag("sentinel", null);

if (!["claude", "cursor", "both"].includes(TOOL)) {
  console.error(`Invalid --tool value: ${TOOL}. Expected: claude | cursor | both`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[verify-live-staging] ${msg}`);
}

function fatal(code, msg) {
  console.error(`[verify-live-staging] FATAL: ${msg}`);
  process.exit(code);
}

function makeSentinel() {
  if (SENTINEL_OVERRIDE) return SENTINEL_OVERRIDE;
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = randomBytes(4).toString("hex");
  return `AIXLE_PARITY_${now}_${rand}`;
}

function readCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error("\n❌ Missing credentials at " + CREDENTIALS_PATH);
    console.error("\nRun the renamed CLI's init flow first:");
    console.error(`\n  npx --package=${TARBALL_PATH} -- aixle-insights init \\`);
    console.error(`    --host ${STAGING_HOST} \\`);
    console.error(`    --keycloak-url https://auth-insights.example.com/realms/db90 \\`);
    console.error(`    --organization-id ${STAGING_ORG}\n`);
    console.error("Then re-run this script.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
}

function pickClaudeToken(creds) {
  const tok = creds?.accounts?.claude_code;
  if (typeof tok !== "string" || tok.length === 0) {
    fatal(1, "credentials.json has no claude_code token. Re-run init.");
  }
  return tok;
}

function pickCursorToken(creds) {
  const tok = creds?.accounts?.cursor;
  if (typeof tok !== "string" || tok.length === 0) {
    fatal(1, "credentials.json has no cursor token. Re-run init.");
  }
  return tok;
}

function packTarball() {
  if (existsSync(TARBALL_PATH)) {
    log(`Reusing existing tarball at ${TARBALL_PATH}`);
    return;
  }
  log("Packing @aixle/insights → .tgz ...");
  const r = spawnSync("npm", ["pack"], {
    cwd: PACKAGE_DIR,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    fatal(1, `npm pack failed: ${r.stderr || r.stdout}`);
  }
  if (!existsSync(TARBALL_PATH)) {
    fatal(1, `npm pack ran but ${TARBALL_NAME} is missing — did the version change?`);
  }
  log(`Packed: ${TARBALL_PATH}`);
}

function runRenamedCliOnce() {
  log("Invoking `npx --package=<tgz> -- aixle-insights run --once` ...");
  const r = spawnSync(
    "npx",
    ["--package=" + TARBALL_PATH, "--", "aixle-insights", "run", "--once"],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      timeout: SYNC_TIMEOUT_MS,
      env: { ...process.env },
    }
  );
  if (r.status !== 0) {
    log(`STDOUT:\n${r.stdout || "(empty)"}`);
    log(`STDERR:\n${r.stderr || "(empty)"}`);
    fatal(2, `aixle-insights run --once exited ${r.status}`);
  }
  log(`Sync completed (stdout: ${(r.stdout || "").trim().slice(0, 200) || "(empty)"})`);
}

async function fetchEvents(token, toolName, startDateIso, endDateIso) {
  const url =
    `${STAGING_HOST}/api/v1/organizations/${STAGING_ORG}/events` +
    `?tool_name=${encodeURIComponent(toolName)}` +
    `&start_date=${encodeURIComponent(startDateIso)}` +
    `&end_date=${encodeURIComponent(endDateIso)}` +
    `&per_page=100`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GET /events returned ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp.json();
}

async function pollForEvent({ token, toolName, syncStart, predicate }) {
  const start = syncStart.toISOString();
  // Generous window — recent ingestion may include a fresh row that landed
  // a second or two after the sync.
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    const end = new Date(Date.now() + 5 * 60_000).toISOString();
    log(`Poll #${attempt}/${POLL_MAX_ATTEMPTS} — GET /events?tool_name=${toolName}&start=${start} ...`);
    const json = await fetchEvents(token, toolName, start, end);
    const rows = Array.isArray(json.events) ? json.events : Array.isArray(json) ? json : [];
    const found = rows.find(predicate);
    if (found) {
      log(`Found target row after ${attempt} attempts.`);
      return found;
    }
    if (attempt < POLL_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  return null;
}

function assertField(row, path, predicate, description, errors) {
  const parts = path.split(".");
  let val = row;
  for (const p of parts) {
    if (val == null) {
      val = undefined;
      break;
    }
    val = val[p];
  }
  if (!predicate(val)) {
    errors.push(`${path}: ${description} (got ${JSON.stringify(val)})`);
  }
}

function assertClaudeRow(row) {
  const errors = [];
  assertField(row, "tool_name", (v) => v === "claude_code", "must equal 'claude_code'", errors);
  assertField(row, "event_type", (v) => v === "chat", "must equal 'chat'", errors);
  assertField(row, "model", (v) => typeof v === "string" && v.length > 0, "must be a non-empty string", errors);
  assertField(row, "tokens_in", (v) => typeof v === "number" && v > 0, "must be > 0", errors);
  assertField(row, "tokens_out", (v) => typeof v === "number" && v > 0, "must be > 0", errors);
  assertField(row, "cost_usd", (v) => typeof v === "number" && v > 0, "must be > 0", errors);
  assertField(row, "project_id", (v) => typeof v === "string" && v.length > 0, "must be a non-empty UUID", errors);
  assertField(row, "metadata.transcript_source", (v) => v === "claude_jsonl", "must equal 'claude_jsonl'", errors);
  assertField(row, "metadata.scannable", (v) => v === true, "must be true", errors);
  return errors;
}

function assertCursorRow(row) {
  const errors = [];
  assertField(row, "tool_name", (v) => v === "cursor", "must equal 'cursor'", errors);
  assertField(row, "event_type", (v) => typeof v === "string" && v.length > 0, "must be a non-empty string", errors);
  assertField(row, "metadata.ingest_source", (v) => v === "cursor_hook", "must equal 'cursor_hook'", errors);
  assertField(row, "cost_usd", (v) => typeof v === "number" && v === 0, "must equal 0 (hook events are 0-cost)", errors);
  return errors;
}

// ──────────────────────────────────────────────────────────────────────────────
// Claude verification
// ──────────────────────────────────────────────────────────────────────────────

async function verifyClaude(sentinel, syncStart) {
  log("─── Claude side ──────────────────────────────────────────");
  const creds = readCredentials();
  const token = pickClaudeToken(creds);

  // Plant a synthetic transcript JSONL with the sentinel embedded.
  // The reader sees this file and ingests both turns. The post-sync row
  // can be located by metadata.session_id (which equals the turnId on the
  // server side per the contract).
  const projectDir = join(homedir(), ".claude", "projects", "test-aixle-parity");
  mkdirSync(projectDir, { recursive: true });
  const sessionId = `aixle-parity-${randomBytes(4).toString("hex")}`;
  const jsonlPath = join(projectDir, `${sessionId}.jsonl`);

  const occurredAt = new Date().toISOString();
  const userTurn = {
    type: "user",
    sessionId,
    timestamp: occurredAt,
    message: { content: [{ type: "text", text: `parity check ${sentinel}` }] },
  };
  const assistantTurn = {
    type: "assistant",
    sessionId,
    timestamp: occurredAt,
    message: {
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 50, output_tokens: 25, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: [{ type: "text", text: "parity ack" }],
    },
  };

  writeFileSync(
    jsonlPath,
    JSON.stringify(userTurn) + "\n" + JSON.stringify(assistantTurn) + "\n",
    "utf-8"
  );
  log(`Planted transcript: ${jsonlPath}`);
  log(`Session ID: ${sessionId}`);

  runRenamedCliOnce();

  const targetTurnId = `${sessionId}:1`;
  const row = await pollForEvent({
    token,
    toolName: "claude_code",
    syncStart,
    predicate: (r) =>
      r?.metadata?.session_id === targetTurnId ||
      (typeof r?.prompt_text === "string" && r.prompt_text.includes(sentinel)),
  });

  if (!row) {
    console.error("\n❌ Claude row never landed within 60s.\n");
    console.error(`Look for sessionId=${sessionId} or sentinel=${sentinel} in /events manually.`);
    process.exit(3);
  }

  const errors = assertClaudeRow(row);
  if (errors.length > 0) {
    console.error("\n❌ Claude row landed but attributes failed parity:\n");
    for (const e of errors) console.error("  - " + e);
    console.error("\nFull row:");
    console.error(JSON.stringify(row, null, 2));
    process.exit(4);
  }

  log(`✓ Claude row landed with full contract (project=${row.project_id?.slice(0, 8)}…, model=${row.model}, tokens=${row.tokens_in}/${row.tokens_out}, cost=$${row.cost_usd})`);
  return { sessionId, row, sentinel };
}

// ──────────────────────────────────────────────────────────────────────────────
// Cursor verification
// ──────────────────────────────────────────────────────────────────────────────

async function verifyCursor(sentinel, syncStart) {
  log("─── Cursor side (synthetic hook NDJSON) ─────────────────");
  const creds = readCredentials();
  const token = pickCursorToken(creds);

  const queueDir = join(homedir(), ".aixle-insights");
  mkdirSync(queueDir, { recursive: true });
  const queuePath = join(queueDir, "hooks-queue.ndjson");

  const conversationId = `aixle-parity-conv-${randomBytes(4).toString("hex")}`;
  const generationId = `gen-${randomBytes(4).toString("hex")}`;

  const hookEvent = {
    hook_event_name: "sessionEnd",
    captured_at: new Date().toISOString(),
    conversation_id: conversationId,
    generation_id: generationId,
    workspace_roots: [process.cwd()],
    workspace: process.cwd(),
    user_prompt: `parity check ${sentinel}`,
    model_id: "claude-sonnet-4-6",
  };

  appendFileSync(queuePath, JSON.stringify(hookEvent) + "\n", "utf-8");
  log(`Appended hook event to ${queuePath}`);
  log(`Conversation ID: ${conversationId}`);

  runRenamedCliOnce();

  const expectedSessionPrefix = `cursor:hook:${conversationId}:`;
  const row = await pollForEvent({
    token,
    toolName: "cursor",
    syncStart,
    predicate: (r) =>
      typeof r?.metadata?.session_id === "string" &&
      r.metadata.session_id.startsWith(expectedSessionPrefix),
  });

  if (!row) {
    console.error("\n❌ Cursor row never landed within 60s.\n");
    console.error(`Look for metadata.session_id starting with '${expectedSessionPrefix}' in /events manually.`);
    process.exit(3);
  }

  const errors = assertCursorRow(row);
  if (errors.length > 0) {
    console.error("\n❌ Cursor row landed but attributes failed parity:\n");
    for (const e of errors) console.error("  - " + e);
    console.error("\nFull row:");
    console.error(JSON.stringify(row, null, 2));
    process.exit(4);
  }

  log(`✓ Cursor row landed with hook-path contract (event_type=${row.event_type}, ingest_source=cursor_hook, cost=$0)`);
  return { conversationId, row, sentinel };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const sentinel = makeSentinel();
  log(`Sentinel: ${sentinel}`);

  packTarball();

  // Capture sync start ~5s before invoking so the API window includes any
  // server-side clock skew + ingestion latency.
  const syncStart = new Date(Date.now() - 5_000);

  const results = [];
  if (TOOL === "claude" || TOOL === "both") {
    results.push({ name: "claude", ...(await verifyClaude(sentinel, syncStart)) });
  }
  if (TOOL === "cursor" || TOOL === "both") {
    results.push({ name: "cursor", ...(await verifyCursor(sentinel, syncStart)) });
  }

  log("─── Summary ───────────────────────────────────────────────");
  for (const r of results) {
    log(`✓ ${r.name}: row id=${r.row?.id ?? "?"} sentinel=${r.sentinel}`);
  }
  log("All verified. Tracking parity confirmed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Unexpected error:", err);
  process.exit(1);
});
