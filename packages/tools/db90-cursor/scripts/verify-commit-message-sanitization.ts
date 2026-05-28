#!/usr/bin/env node
/**
 * CUR-V16 — POST a cursor commit payload whose commit_message embeds a fake API key.
 * Requires Temporal ingest path (not ingest fallback) for server-side redaction.
 *
 * Usage (env vars or ~/.db90-cursor/config.json — same as the CLI):
 *   npm run verify:commit-message-sanitization
 *   DB90_HOST=http://localhost:3000 DB90_TOKEN=db90_... npm run verify:commit-message-sanitization
 *
 * After 202, confirm in DB / UI:
 *   metadata.commit_hash = cur-v16-verify-deadbeef
 *   metadata.commit_message must NOT contain the fake key; expect [REDACTED] from policy.
 *
 * Automated guarantee: packages/api/spec/temporal/cursor_commit_sanitization_spec.rb
 */
import type { Db90Payload } from "../src/mapper.js";
import { requireIngestConfig } from "./resolve-ingest-config.js";

/** Fake key — must never be a real credential; only for sanitization verification. */
export const CUR_V16_FAKE_API_KEY =
  "sk_live_" + "EXAMPLEEXAMPLEEXAMPLEexampleexample";

export const SAMPLE_SANITIZATION_PROBE: Db90Payload = {
  tool_name: "cursor",
  event_type: "commit",
  model: "unknown",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0,
  occurred_at: new Date().toISOString(),
  metadata: {
    cursor_session_id: null,
    workspace: "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
    workspace_scope: "global",
    cost_model: "estimated_line_count",
    source: "recent_commit",
    commit_hash: "cur-v16-verify-deadbeef",
    commit_message: `CUR-V16 probe api_key=${CUR_V16_FAKE_API_KEY} (safe to delete)`,
    repo_name: "acme/demo",
    branch_name: "feature/cur-v16-verify",
    ai_percentage: 0,
    scannable: false,
    risk_level: "none",
  },
};

async function main(): Promise<void> {
  const { host, token } = requireIngestConfig();

  const url = `${host.replace(/\/$/, "")}/api/v1/ingest/events`;
  console.log(`POST ${url}`);
  console.log(`commit_hash=${SAMPLE_SANITIZATION_PROBE.metadata.commit_hash}`);
  console.log(
    "commit_message contains fake api_key=… (must be redacted after Temporal workflow)"
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(SAMPLE_SANITIZATION_PROBE),
  });

  const bodyText = await response.text();
  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    bodyJson = bodyText;
  }

  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log(JSON.stringify(bodyJson, null, 2));

  if (response.status !== 202) {
    console.error("\nCUR-V16 fail: expected HTTP 202 Accepted.");
    process.exit(1);
  }

  const data = bodyJson as { data?: { fallback?: boolean } };
  if (data.data?.fallback) {
    console.warn(
      "\nCUR-V16 warn: ingest used fallback (Temporal unavailable) — metadata is NOT sanitized."
    );
    console.warn("Re-run with Temporal worker up, or rely on RSpec: cursor_commit_sanitization_spec.rb");
    process.exit(2);
  }

  console.log("\nCUR-V16 ingest accepted (Temporal path).");
  console.log(
    "Confirm stored metadata.commit_message for commit_hash=cur-v16-verify-deadbeef is redacted (no fake key)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
