/**
 * CUR-V14 — compare db90-cursor CLI vs db90-telemetry-mcp cursor slice (dry-run counts).
 */
import type { Db90Payload } from "./mapper.js";
import { inferIngestPath, type CursorIngestPath } from "./payload-contract.js";
import type { CollectedPayloads } from "./collect-payloads.js";

/** MCP-only path (composer JSONL transcripts). */
export type McpOnlyPath = "mcp_transcript";

export type ParityPath = CursorIngestPath | McpOnlyPath | "unknown";

export interface ParityPathCounts {
  daily_tab: number;
  daily_composer: number;
  legacy_request: number;
  recent_commit: number;
  mcp_transcript: number;
  unknown: number;
}

export interface CliMcpParityRow {
  path: ParityPath;
  cli_count: number;
  mcp_count: number;
  status: "both" | "cli_only" | "mcp_only" | "neither";
  counts_match: boolean | null;
  note: string | null;
}

export interface CliMcpParityReport {
  captured_at: string;
  platform: NodeJS.Platform;
  cli: CollectedPayloads;
  mcp: CollectedPayloads & { mcp_transcript_mode: boolean; transcript_files: number };
  rows: CliMcpParityRow[];
  /** Paths where CLI has payloads but MCP does not (bad for MCP-only orgs). */
  gaps_for_mcp_only_orgs: string[];
  parity_ok: boolean;
  summary_note: string;
}

export function inferParityPath(payload: Db90Payload): ParityPath {
  const meta = payload.metadata as Record<string, unknown>;
  if (meta.transcript_source === "agent_transcript") return "mcp_transcript";
  return inferIngestPath(payload);
}

export function countByParityPath(payloads: Db90Payload[]): ParityPathCounts {
  const counts: ParityPathCounts = {
    daily_tab: 0,
    daily_composer: 0,
    legacy_request: 0,
    recent_commit: 0,
    mcp_transcript: 0,
    unknown: 0,
  };
  for (const p of payloads) {
    const path = inferParityPath(p);
    if (path === "unknown") counts.unknown++;
    else counts[path]++;
  }
  return counts;
}

const SHARED_PATHS: CursorIngestPath[] = [
  "daily_tab",
  "daily_composer",
  "legacy_request",
  "recent_commit",
];

function countForPath(counts: ParityPathCounts, path: ParityPath): number {
  if (path === "unknown") return counts.unknown;
  return counts[path];
}

export function buildCliMcpParityReport(
  cli: CollectedPayloads,
  mcp: CollectedPayloads & { mcp_transcript_mode: boolean; transcript_files: number }
): CliMcpParityReport {
  const cliCounts = countByParityPath(cli.payloads);
  const mcpCounts = countByParityPath(mcp.payloads);

  const rows: CliMcpParityRow[] = [];
  const allPaths: ParityPath[] = [...SHARED_PATHS, "mcp_transcript", "unknown"];

  for (const path of allPaths) {
    const cli_count = countForPath(cliCounts, path);
    const mcp_count = countForPath(mcpCounts, path);
    let status: CliMcpParityRow["status"];
    if (cli_count > 0 && mcp_count > 0) status = "both";
    else if (cli_count > 0) status = "cli_only";
    else if (mcp_count > 0) status = "mcp_only";
    else status = "neither";

    let counts_match: boolean | null = null;
    if (cli_count > 0 || mcp_count > 0) {
      counts_match = cli_count === mcp_count;
    }

    let note: string | null = null;
    if (path === "mcp_transcript") {
      note = "MCP-only — composer agent-transcripts JSONL (~/.cursor/projects)";
    } else if (
      path === "daily_composer" &&
      mcp.mcp_transcript_mode &&
      cli_count > mcp_count
    ) {
      note =
        "MCP suppresses daily composer chat when transcripts are present (dedupe); CLI still emits daily composer.";
    } else if (status === "cli_only") {
      note = "Gap for MCP-only orgs — MCP slice missing this path.";
    } else if (status === "both" && counts_match === false) {
      note = "Count mismatch — check watermarks not used (full dry-run should match).";
    }

    rows.push({ path, cli_count, mcp_count, status, counts_match, note });
  }

  const composerCoveredByTranscripts =
    mcp.mcp_transcript_mode &&
    cliCounts.daily_composer > 0 &&
    mcpCounts.mcp_transcript > 0;

  const gaps_for_mcp_only_orgs = rows
    .filter((r) => {
      if (r.status !== "cli_only" || r.path === "unknown") return false;
      if (r.path === "daily_composer" && composerCoveredByTranscripts) return false;
      return true;
    })
    .map((r) => r.path);

  const sharedMismatch = rows.some((r) => {
    if (!SHARED_PATHS.includes(r.path as CursorIngestPath)) return false;
    if (r.path === "daily_composer" && composerCoveredByTranscripts) return false;
    return r.status === "both" && r.counts_match === false;
  });

  const parity_ok = gaps_for_mcp_only_orgs.length === 0 && !sharedMismatch;

  let summary_note: string;
  if (parity_ok) {
    const transcriptNote = mcpCounts.mcp_transcript
      ? ` MCP emits ${mcpCounts.mcp_transcript} transcript turn(s) instead of daily composer aggregates.`
      : "";
    summary_note =
      "Shared ingest paths match between CLI and MCP on this install." + transcriptNote;
  } else if (gaps_for_mcp_only_orgs.length > 0) {
    summary_note =
      `MCP-only gap(s): ${gaps_for_mcp_only_orgs.join(", ")} — CLI has data MCP slice does not emit.`;
  } else {
    summary_note = "Shared path count mismatch — investigate reader/mapper drift between packages.";
  }

  return {
    captured_at: new Date().toISOString(),
    platform: process.platform,
    cli,
    mcp,
    rows,
    gaps_for_mcp_only_orgs,
    parity_ok,
    summary_note,
  };
}
