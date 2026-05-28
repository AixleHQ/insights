#!/usr/bin/env node
/**
 * CUR-V07 / CUR-V11 — audit legacy cursor.db vs state.vscdb on this machine.
 * Does not POST to db90. Paths are redacted (~ home) in JSON output.
 *
 * Usage:
 *   npm run audit:local-stores
 *   npm run audit:local-stores -- --json-out ./my-audit.json
 */
import { writeFileSync } from "node:fs";
import { auditCursorLocalStores } from "../src/store-audit.js";

function parseJsonOut(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json-out" && argv[i + 1]) return argv[i + 1];
  }
  return undefined;
}

function main(): void {
  const report = auditCursorLocalStores();

  console.log("Cursor local store audit (CUR-V07)\n");
  console.log(`Platform: ${report.platform}`);
  console.log(`SQLite probe (global state.vscdb): ${report.sqlite_probe_ok ? "OK" : "FAILED"}`);
  if (!report.sqlite_probe_ok) {
    console.error(
      "\nRebuild native module: cd packages/tools && npm rebuild better-sqlite3\n"
    );
  }

  console.log("\nstate.vscdb:");
  console.log(`  paths found: ${report.state_vscdb.total_paths}`);
  console.log(
    `  global: exists=${report.state_vscdb.global.exists} dailyStats keys=${report.state_vscdb.global.daily_stats_key_count} recentCommit=${report.state_vscdb.global.has_recent_commit}`
  );
  console.log(`  workspace-scoped DBs: ${report.state_vscdb.workspace_scoped_count}`);
  console.log(
    `  workspaces with dailyStats: ${report.state_vscdb.workspace_with_daily_stats}`
  );

  console.log("\nlegacy cursor.db:");
  console.log(`  files found: ${report.legacy_cursor_db.count}`);
  console.log(`  with CursorRequestFeedback table: ${report.legacy_cursor_db.with_feedback_table}`);
  console.log(`  total feedback rows: ${report.legacy_cursor_db.total_feedback_rows}`);

  console.log(`\nPath C verdict: ${report.path_c_verdict}`);
  console.log(report.ingest_note);

  console.log("\ndailyStats versions (CUR-V11):");
  if (report.daily_stats_versions.buckets.length === 0) {
    console.log("  (none)");
  } else {
    for (const b of report.daily_stats_versions.buckets) {
      const range =
        b.date_min && b.date_max ? ` dates ${b.date_min} … ${b.date_max}` : "";
      console.log(`  ${b.version}: ${b.key_count} key(s)${range}`);
      for (const sample of b.sample_keys) {
        console.log(`    e.g. ${sample}`);
      }
    }
    if (report.daily_stats_versions.unmatched_keys.length > 0) {
      console.log(`  unmatched: ${report.daily_stats_versions.unmatched_keys.join(", ")}`);
    }
  }
  console.log(report.daily_stats_version_note);

  const jsonOut = parseJsonOut(process.argv);
  const json = JSON.stringify(report, null, 2);
  if (jsonOut) {
    writeFileSync(jsonOut, json, "utf-8");
    console.log(`\nWrote ${jsonOut}`);
  } else {
    console.log("\n--- JSON (redacted paths) ---");
    console.log(json);
  }

  if (!report.sqlite_probe_ok) {
    process.exit(1);
  }
}

main();
