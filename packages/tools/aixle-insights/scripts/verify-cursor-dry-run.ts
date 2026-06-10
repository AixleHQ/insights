#!/usr/bin/env node
/**
 * CUR-V02 — collect payloads from the local Cursor install, validate contract, print matrix.
 * Does not POST to db90 (no token required).
 *
 * Usage: npm run verify:cursor-dry-run --workspace=@db90/telemetry-mcp
 */
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectLocalCursorPayloads } from "../src/collect-cursor-payloads.js";
import { probeCursorGlobalStateDb } from "../src/readers/cursor.js";
import {
  summarizeDryRunMatrix,
  validateCursorPayload,
  type CursorIngestPath,
} from "../src/cursor-payload-contract.js";
import type { CursorDb90Payload } from "../src/readers/cursor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function redactPayload(payload: CursorDb90Payload): CursorDb90Payload {
  const home = homedir();
  const redactPath = (p: string) => p.replaceAll(home, "~");

  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      workspace: redactPath(payload.metadata.workspace),
      commit_message: payload.metadata.commit_message
        ? `${payload.metadata.commit_message.slice(0, 40)}…`
        : undefined,
      prompt_text: payload.metadata.prompt_text
        ? `${payload.metadata.prompt_text.slice(0, 40)}…`
        : undefined,
      assistant_text: payload.metadata.assistant_text
        ? `${payload.metadata.assistant_text.slice(0, 40)}…`
        : undefined,
    },
  };
}

function main(): void {
  console.log("Probing global state.vscdb (better-sqlite3)…");
  if (!probeCursorGlobalStateDb(true)) {
    console.error(
      "\nSQLite probe failed. From repo root try:\n  cd packages/tools && npm rebuild better-sqlite3\nThen re-run: npm run verify:cursor-dry-run --workspace=@db90/telemetry-mcp"
    );
    process.exit(1);
  }

  void collectLocalCursorPayloads({ fullScan: true, verbose: true })
    .then(({ payloads, counts }) => {
      console.log(`Collected ${payloads.length} payload(s) from local Cursor stores.`);
      const dedupeDropped = counts.dailyStatsEntriesRaw - counts.dailyStatsEntries;
      console.log(
        `  legacy rows=${counts.legacy}, dailyStats raw=${counts.dailyStatsEntriesRaw}, deduped=${counts.dailyStatsEntries}` +
          (dedupeDropped > 0 ? ` (${dedupeDropped} duplicate date row(s) dropped)` : "") +
          `, recentCommit snapshots=${counts.recentCommitSnapshots}` +
          `, transcript turns=${counts.transcriptTurns}, transcript payloads=${counts.transcriptPayloads}`
      );

      let failed = 0;
      for (let i = 0; i < payloads.length; i++) {
        const result = validateCursorPayload(payloads[i]);
        if (!result.ok) {
          failed++;
          console.error(`Payload #${i + 1} (${result.path}):`);
          for (const err of result.errors) console.error(`  - ${err}`);
        }
      }

      const matrix = summarizeDryRunMatrix(payloads);
      console.log("\nIngest path matrix:");
      for (const row of matrix) {
        console.log(`  ${row.path}: ${row.count} (sample ${row.sample_occurred_at ?? "n/a"})`);
      }

      const required: CursorIngestPath[] = ["daily_tab", "daily_composer"];
      for (const path of required) {
        if (!matrix.some((r) => r.path === path)) {
          console.warn(`  warn: no "${path}" payloads — use Cursor or check dailyStats keys`);
        }
      }

      const fixturePath = join(
        __dirname,
        "../../../../docs/data-pipeline/fixtures/cursor-dry-run-matrix.json"
      );
      mkdirSync(dirname(fixturePath), { recursive: true });
      const samplesByPath: Record<string, CursorDb90Payload[]> = {};
      for (const p of payloads) {
        const path = validateCursorPayload(p).path;
        if (!samplesByPath[path]) samplesByPath[path] = [];
        if (samplesByPath[path].length < 2) samplesByPath[path].push(redactPayload(p));
      }

      writeFileSync(
        fixturePath,
        JSON.stringify(
          {
            captured_at: new Date().toISOString(),
            source: "@db90/telemetry-mcp",
            payload_count: payloads.length,
            matrix,
            samples_by_path: samplesByPath,
            contract_valid: failed === 0,
          },
          null,
          2
        ),
        "utf-8"
      );
      console.log(`\nWrote redacted samples → ${fixturePath}`);

      if (failed > 0) {
        console.error(`\n${failed} payload(s) failed contract validation.`);
        process.exit(1);
      }
      console.log(
        "\nAll payloads match DATA-CURSOR.md §3.5 contract (+ MCP agent transcript extension)."
      );
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`verify:cursor-dry-run failed: ${msg}`);
      process.exit(1);
    });
}

main();
