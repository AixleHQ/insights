#!/usr/bin/env node
/**
 * CUR-V08 — POST a sample cursor recent_commit payload to the ingest API.
 * Requires DB90_HOST and DB90_TOKEN (staging or local).
 *
 * Usage (env vars or ~/.db90-cursor/config.json — same as the CLI):
 *   npm run verify:commit-ingest
 */
import type { Db90Payload } from "../src/mapper.js";
import { requireIngestConfig } from "./resolve-ingest-config.js";

/** Representative Path B payload (matches mapRecentCommit / DATA-CURSOR.md §3.5). */
export const SAMPLE_COMMIT_PAYLOAD: Db90Payload = {
  tool_name: "cursor",
  event_type: "commit",
  model: "unknown",
  tokens_in: 10,
  tokens_out: 2,
  cost_usd: 0.01,
  occurred_at: new Date().toISOString(),
  metadata: {
    cursor_session_id: null,
    workspace: "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
    workspace_scope: "global",
    cost_model: "estimated_line_count",
    source: "recent_commit",
    commit_hash: "cur-v08-verify-deadbeef",
    commit_message: "[AIX-235] CUR-V08 commit ingest verification (safe to delete)",
    repo_name: "acme/demo",
    branch_name: "feature/cur-v08-verify",
    ai_percentage: 42,
    scannable: false,
    risk_level: "none",
  },
};

async function main(): Promise<void> {
  const { host, token } = requireIngestConfig();

  const url = `${host.replace(/\/$/, "")}/api/v1/ingest/events`;
  console.log(`POST ${url}`);
  console.log(`event_type=${SAMPLE_COMMIT_PAYLOAD.event_type} source=${SAMPLE_COMMIT_PAYLOAD.metadata.source}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(SAMPLE_COMMIT_PAYLOAD),
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

  if (response.status === 202) {
    console.log("\nCUR-V08 pass: ingest accepted commit event.");
    console.log(
      "Confirm in DB90: filter tool_events by event_type=commit and metadata.commit_hash=cur-v08-verify-deadbeef"
    );
    return;
  }

  console.error("\nCUR-V08 fail: expected HTTP 202 Accepted.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
