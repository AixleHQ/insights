#!/usr/bin/env node
/**
 * CUR-V14 — CLI vs MCP cursor slice parity (dry-run counts, no POST).
 * MCP reader is imported here (tsx only) — not compiled into @db90/cursor dist.
 */
import { writeFileSync } from "node:fs";
import type { Db90Payload } from "../src/mapper.js";
import { probeCursorGlobalStateDb } from "../src/cursor-reader.js";
import { collectSyncPayloads } from "../src/collect-payloads.js";
import {
  buildCliMcpParityReport,
  type CliMcpParityReport,
} from "../src/cli-mcp-parity.js";
import type { CollectedPayloads } from "../src/collect-payloads.js";

function parseJsonOut(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json-out" && argv[i + 1]) return argv[i + 1];
  }
  return undefined;
}

/** Collect MCP cursor payloads (same sources as sync dry-run, no POST / watermarks). */
async function collectMcpCursorPayloads(options: {
  since?: Date | null;
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  verbose?: boolean;
}): Promise<CollectedPayloads & { mcp_transcript_mode: boolean; transcript_files: number }> {
  const mcp = await import("../../db90-telemetry-mcp/src/readers/cursor.js");
  const since = options.since ?? null;
  const verbose = options.verbose ?? false;
  const baseDir = options.cursorBaseDir;

  const transcriptTurns = await mcp.readCursorTranscriptSessions(
    baseDir,
    options.cursorTranscriptProjectDirs,
    verbose
  );
  const transcriptMode = transcriptTurns.length > 0;

  const rawEvents = mcp.readEvents(since, baseDir, verbose);
  const dailyStats = mcp.readDailyStats(since, baseDir, verbose);
  const recentCommits = mcp.readRecentCommitSnapshots(since, baseDir, verbose);

  const mappedFromEvents = rawEvents
    .map(({ row, workspacePath }) =>
      mcp.mapEvent(row, workspacePath, undefined, mcp.DEFAULT_CURSOR_PRICING)
    )
    .filter((e) => e !== null)
    .filter((p) => !transcriptMode || p.event_type !== "chat") as Db90Payload[];

  const mappedFromStats = dailyStats
    .flatMap((entry) => mcp.mapDailyStats(entry, undefined, mcp.DEFAULT_CURSOR_PRICING))
    .filter((p) => !transcriptMode || p.event_type !== "chat") as Db90Payload[];

  const mappedFromCommits = recentCommits
    .map((snapshot) => mcp.mapRecentCommit(snapshot, undefined, mcp.DEFAULT_CURSOR_PRICING))
    .filter((p) => p !== null) as Db90Payload[];

  const mappedFromTranscripts = transcriptTurns.map((turn) =>
    mcp.mapTranscriptTurn(turn, undefined, mcp.DEFAULT_CURSOR_PRICING)
  ) as Db90Payload[];

  return {
    payloads: [
      ...mappedFromEvents,
      ...mappedFromStats,
      ...mappedFromCommits,
      ...mappedFromTranscripts,
    ],
    counts: {
      legacy: mappedFromEvents.length,
      dailyStatsEntriesRaw: dailyStats.length,
      dailyStatsEntries: dailyStats.length,
      recentCommitSnapshots: mappedFromCommits.length,
    },
    mcp_transcript_mode: transcriptMode,
    transcript_files: transcriptTurns.length,
  };
}

async function runCliMcpParityCheck(options: {
  since?: Date | null;
  cursorBaseDir?: string;
  cursorTranscriptProjectDirs?: string[];
  verbose?: boolean;
}): Promise<CliMcpParityReport> {
  const cli = collectSyncPayloads({
    since: options.since ?? null,
    verbose: options.verbose,
    cursorBaseDir: options.cursorBaseDir,
  });
  const mcp = await collectMcpCursorPayloads(options);
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
