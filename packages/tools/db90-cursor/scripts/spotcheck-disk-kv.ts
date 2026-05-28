#!/usr/bin/env node
/**
 * CUR-V12 — read-only cursorDiskKV spot-check (composerData + bubbleId).
 *
 * Usage:
 *   npm run spotcheck:disk-kv
 *   npm run spotcheck:disk-kv -- --json-out ./disk-kv-spotcheck.json
 */
import { writeFileSync } from "node:fs";
import { spotCheckCursorDiskKv } from "../src/cursor-disk-kv-spotcheck.js";

function parseJsonOut(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json-out" && argv[i + 1]) return argv[i + 1];
  }
  return undefined;
}

function main(): void {
  const report = spotCheckCursorDiskKv();

  console.log("Cursor cursorDiskKV spot-check (CUR-V12)\n");
  console.log(`DB: ${report.db_path_redacted}`);
  console.log(`Table ${report.table_exists ? "present" : "missing"}; SQLite: ${report.sqlite_ok ? "OK" : "FAILED"}`);

  if (report.key_counts) {
    const k = report.key_counts;
    console.log("\nKey counts:");
    console.log(`  composerData:*  ${k.composer_data}`);
    console.log(`  bubbleId:*      ${k.bubble_id}`);
    console.log(`  mcp*            ${k.mcp}`);
    console.log(`  inlineDiff*     ${k.inline_diff}`);
    console.log(`  other           ${k.other}`);
    console.log(`  total           ${k.total}`);
  }

  if (report.sample_composer) {
    console.log("\nSample composerData:");
    console.log(`  key: ${report.sample_composer.key}`);
    console.log(`  observed shape OK: ${report.sample_composer.shape.matches_observed}`);
    console.log(`  §2.2 example JSON: ${report.sample_composer.shape.matches_doc_example}`);
    if (report.sample_composer.shape.resolved) {
      console.log(`  resolved: ${JSON.stringify(report.sample_composer.shape.resolved)}`);
    }
    const failed = report.sample_composer.shape.checks.filter((c) => !c.matches);
    if (failed.length > 0) {
      console.log(`  field mismatches: ${failed.map((c) => c.field).join(", ")}`);
    }
    console.log(`  redacted: ${JSON.stringify(report.sample_composer.fields_redacted)}`);
  }

  if (report.sample_bubble) {
    console.log("\nSample bubbleId:");
    console.log(`  key: ${report.sample_bubble.key}`);
    console.log(`  observed shape OK: ${report.sample_bubble.shape.matches_observed}`);
    console.log(`  §2.2 example JSON: ${report.sample_bubble.shape.matches_doc_example}`);
    if (report.sample_bubble.shape.resolved) {
      console.log(`  resolved: ${JSON.stringify(report.sample_bubble.shape.resolved)}`);
    }
    const failed = report.sample_bubble.shape.checks.filter((c) => !c.matches);
    if (failed.length > 0) {
      console.log(`  field mismatches: ${failed.map((c) => c.field).join(", ")}`);
    }
    console.log(`  redacted: ${JSON.stringify(report.sample_bubble.fields_redacted)}`);
  }

  console.log(`\nObserved match (both): ${report.shape_matches_observed}`);
  console.log(`§2.2 example match (both): ${report.shape_matches_doc_example}`);
  console.log(report.ingest_scope_note);
  if (report.error) {
    console.log(`\nNote: ${report.error}`);
  }

  const jsonOut = parseJsonOut(process.argv);
  const json = JSON.stringify(report, null, 2);
  if (jsonOut) {
    writeFileSync(jsonOut, json, "utf-8");
    console.log(`\nWrote ${jsonOut}`);
  } else {
    console.log("\n(Full JSON: npm run spotcheck:disk-kv -- --json-out ./disk-kv-spotcheck.json)");
  }

  if (!report.sqlite_ok) {
    process.exit(1);
  }
}

main();
