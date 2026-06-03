import { describe, expect, it } from "vitest";
import type { CursorDb90Payload } from "../readers/cursor.js";
import {
  buildCliMcpParityReport,
  countByParityPath,
  inferParityPath,
} from "../cli-mcp-parity.js";

function payload(
  partial: Partial<CursorDb90Payload> & { metadata?: Record<string, unknown> }
): CursorDb90Payload {
  return {
    tool_name: "cursor",
    event_type: "chat",
    model: "unknown",
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: 0,
    occurred_at: "2026-05-27T00:00:00.000Z",
    metadata: {
      cursor_session_id: null,
      workspace: "/tmp",
      workspace_scope: "global",
      cost_model: "estimated_line_count",
      scannable: false,
      risk_level: "none",
      ...partial.metadata,
    },
    ...partial,
  } as CursorDb90Payload;
}

function emptyCollected() {
  return {
    payloads: [] as CursorDb90Payload[],
    counts: {
      legacy: 0,
      dailyStatsEntriesRaw: 0,
      dailyStatsEntries: 0,
      recentCommitSnapshots: 0,
      transcriptTurns: 0,
      transcriptPayloads: 0,
    },
  };
}

describe("inferParityPath", () => {
  it("detects MCP transcript payloads", () => {
    const p = payload({
      metadata: {
        session_id: "turn-1",
        cursor_session_id: "sess",
        transcript_source: "agent_transcript",
        workspace: "/tmp",
        cost_model: "estimated_transcript_text",
        scannable: true,
        risk_level: "none",
      },
    });
    expect(inferParityPath(p)).toBe("mcp_transcript");
  });
});

describe("buildCliMcpParityReport", () => {
  it("flags cli_only paths as MCP-only gaps", () => {
    const cli = {
      ...emptyCollected(),
      payloads: [
        payload({
          event_type: "completion",
          metadata: {
            cursor_session_id: null,
            workspace: "/w",
            workspace_scope: "global",
            cost_model: "estimated_line_count",
            scannable: false,
            risk_level: "none",
          },
        }),
      ],
      counts: { ...emptyCollected().counts, dailyStatsEntries: 1 },
    };
    const mcp = {
      ...emptyCollected(),
      mcp_transcript_mode: false,
      transcript_files: 0,
    };

    const report = buildCliMcpParityReport(cli, mcp);
    expect(report.gaps_for_mcp_only_orgs).toContain("daily_tab");
    expect(report.parity_ok).toBe(false);
  });

  it("does not flag daily_composer cli_only when transcripts cover composer signal", () => {
    const dailyComposer = payload({
      event_type: "chat",
      metadata: {
        cursor_session_id: null,
        workspace: "/w",
        workspace_scope: "global",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
      },
    });
    const transcript = payload({
      metadata: {
        session_id: "turn-1",
        cursor_session_id: "s1",
        transcript_source: "agent_transcript",
        workspace: "/w",
        cost_model: "estimated_transcript_text",
        scannable: true,
        risk_level: "none",
      },
    });
    const cli = {
      ...emptyCollected(),
      payloads: [dailyComposer],
    };
    const mcp = {
      ...emptyCollected(),
      payloads: [transcript],
      mcp_transcript_mode: true,
      transcript_files: 1,
    };
    const report = buildCliMcpParityReport(cli, mcp);
    expect(report.gaps_for_mcp_only_orgs).not.toContain("daily_composer");
    expect(report.parity_ok).toBe(true);
  });

  it("passes when shared paths match", () => {
    const p = payload({
      event_type: "commit",
      metadata: {
        cursor_session_id: null,
        workspace: "/w",
        workspace_scope: "global",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
        source: "recent_commit",
        commit_hash: "abc",
      },
    });
    const collected = {
      ...emptyCollected(),
      payloads: [p],
      counts: { ...emptyCollected().counts, recentCommitSnapshots: 1 },
    };
    const report = buildCliMcpParityReport(collected, {
      ...collected,
      mcp_transcript_mode: false,
      transcript_files: 0,
    });
    expect(report.parity_ok).toBe(true);
    expect(countByParityPath(collected.payloads).recent_commit).toBe(1);
  });
});
