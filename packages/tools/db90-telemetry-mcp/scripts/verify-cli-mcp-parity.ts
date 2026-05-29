#!/usr/bin/env node
/**
 * CUR-V14 — CLI vs MCP cursor slice parity (dry-run counts, no POST).
 */
import { writeFileSync } from "node:fs";
import { collectLocalCursorPayloads } from "../src/collect-cursor-payloads.js";
import {
  buildCliMcpParityReport,
  type CliMcpParityReport,
  type McpCursorCollectedPayloads,
} from "../src/cli-mcp-parity.js";
import { probeCursorGlobalStateDb } from "../src/readers/cursor.js";

function parseJsonOut(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json-out" && argv[i + 1]) return argv[i + 1];
  }
  return undefined;
}

async function runCliMcpParityCheck(options: {
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  verbose?: boolean;
}): Promise<CliMcpParityReport> {
  const cursorPkg = await import("../../db90-cursor/src/collect-payloads.js").catch(
    (err: unknown) => {
      console.error(
        "@db90/cursor is not available — ensure the sibling package is installed.\n" +
        "Hint: run `npm install` from packages/tools/.\n" +
        (err instanceof Error ? err.message : String(err))
      );
      process.exit(1);
    }
  );
  const { collectSyncPayloads } = cursorPkg;

  const cli = collectSyncPayloads({
    since: null,
    recentCommitHashDedup: false,
    verbose: options.verbose,
    cursorBaseDir: options.cursorBaseDir,
  });

  const mcpCollected = await collectLocalCursorPayloads({
    fullScan: true,
    verbose: options.verbose,
    cursorBaseDir: options.cursorBaseDir,
    cursorTranscriptProjectDirs: options.cursorTranscriptProjectDirs,
  });

  const mcp: McpCursorCollectedPayloads = {
    ...mcpCollected,
    mcp_transcript_mode: mcpCollected.counts.transcriptTurns > 0,
    transcript_files: mcpCollected.counts.transcriptPayloads,
  };

  return buildCliMcpParityReport(cli, mcp);
}

async function main(): Promise<void> {
  console.log("CLI vs MCP cursor parity (CUR-V14)\n");

  if (!probeCursorGlobalStateDb(true)) {
    console.error(
      "SQLite probe failed. Try: cd packages/tools && npm rebuild better-sqlite3"
    );
    process.exit(1);
  }

  const report = await runCliMcpParityCheck({ verbose: true });

  console.log("Source counts:");
  console.log(
    `  CLI: legacy=${report.cli.counts.legacy} dailyStats=${report.cli.counts.dailyStatsEntries} recentCommit=${report.cli.counts.recentCommitSnapshots} total=${report.cli.payloads.length}`
  );
  console.log(
    `  MCP: legacy=${report.mcp.counts.legacy} dailyStats=${report.mcp.counts.dailyStatsEntries} recentCommit=${report.mcp.counts.recentCommitSnapshots} transcripts=${report.mcp.transcript_files} total=${report.mcp.payloads.length}`
  );
  if (report.mcp.mcp_transcript_mode) {
    console.log("  MCP transcript mode: ON (daily composer chat suppressed on MCP side)");
  }

  console.log("\nParity matrix:");
  console.log("  path                  | CLI | MCP | status    | match");
  for (const row of report.rows) {
    if (row.status === "neither") continue;
    const match =
      row.counts_match === null ? "n/a" : row.counts_match ? "yes" : "NO";
    console.log(
      `  ${row.path.padEnd(21)} | ${String(row.cli_count).padStart(3)} | ${String(row.mcp_count).padStart(3)} | ${row.status.padEnd(9)} | ${match}`
    );
    if (row.note) console.log(`    → ${row.note}`);
  }

  console.log(`\n${report.summary_note}`);
  if (report.gaps_for_mcp_only_orgs.length > 0) {
    console.log(`Gaps for MCP-only: ${report.gaps_for_mcp_only_orgs.join(", ")}`);
  }

  const jsonOut = parseJsonOut(process.argv);
  if (jsonOut) {
    const slim = {
      captured_at: report.captured_at,
      parity_ok: report.parity_ok,
      mcp_transcript_mode: report.mcp.mcp_transcript_mode,
      rows: report.rows,
      gaps_for_mcp_only_orgs: report.gaps_for_mcp_only_orgs,
      summary_note: report.summary_note,
    };
    writeFileSync(jsonOut, JSON.stringify(slim, null, 2), "utf-8");
    console.log(`\nWrote ${jsonOut}`);
  }

  process.exit(report.parity_ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
