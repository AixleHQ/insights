import { describe, expect, it } from "vitest";
import type { CursorDb90Payload } from "../readers/cursor.js";
import { HOOK_COST_MODEL } from "../readers/cursor.js";
import {
  inferIngestPath,
  summarizeDryRunMatrix,
  validateCursorPayload,
} from "../cursor-payload-contract.js";

function basePayload(overrides: Partial<CursorDb90Payload> = {}): CursorDb90Payload {
  return {
    tool_name: "cursor",
    event_type: "completion",
    model: "unknown",
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: 0.01,
    occurred_at: "2026-05-20T00:00:00.000Z",
    metadata: {
      cursor_session_id: null,
      workspace: "/tmp/globalStorage/state.vscdb",
      workspace_scope: "global",
      cost_model: "estimated_line_count",
      scannable: false,
      risk_level: "none",
    },
    ...overrides,
  };
}

describe("validateCursorPayload", () => {
  it("accepts daily tab completion payload", () => {
    const result = validateCursorPayload(basePayload());
    expect(result.ok).toBe(true);
    expect(result.path).toBe("daily_tab");
  });

  it("accepts daily composer chat payload", () => {
    const result = validateCursorPayload(basePayload({ event_type: "chat" }));
    expect(result.ok).toBe(true);
    expect(result.path).toBe("daily_composer");
  });

  it("accepts legacy request payload with session id", () => {
    const result = validateCursorPayload(
      basePayload({
        event_type: "chat",
        model: "gpt-4.1",
        metadata: {
          ...basePayload().metadata,
          cursor_session_id: "sess-abc",
          cost_model: "token_count",
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe("legacy_request");
  });

  it("accepts MCP agent transcript payload", () => {
    const result = validateCursorPayload(
      basePayload({
        event_type: "chat",
        metadata: {
          session_id: "cursor-session-1:1",
          cursor_session_id: "cursor-session-1",
          workspace: "/tmp/ws",
          cost_model: "estimated_transcript_text",
          scannable: true,
          risk_level: "low",
          risk_categories: [],
          risk_score: 0,
          transcript_source: "agent_transcript",
          composer_name: "Test",
          prompt_text: "hello",
          assistant_text: "world",
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe("mcp_transcript");
  });

  it("rejects legacy request with line-based cost_model", () => {
    const result = validateCursorPayload(
      basePayload({
        event_type: "chat",
        model: "gpt-4.1",
        metadata: {
          ...basePayload().metadata,
          cursor_session_id: "sess-abc",
          cost_model: "estimated_line_count",
        },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("token_count"))).toBe(true);
  });

  it("accepts recent commit payload with commit metadata keys", () => {
    const result = validateCursorPayload(
      basePayload({
        event_type: "commit",
        occurred_at: "2026-05-20T14:30:00.000Z",
        metadata: {
          cursor_session_id: null,
          workspace: "/tmp/globalStorage/state.vscdb",
          workspace_scope: "global",
          cost_model: "estimated_line_count",
          scannable: false,
          risk_level: "none",
          source: "recent_commit",
          commit_hash: "abc123",
          commit_message: "feat: example",
          repo_name: "org/repo",
          branch_name: "main",
          ai_percentage: 55,
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe("recent_commit");
  });

  it("accepts cursor hook payloads and classifies them before legacy requests", () => {
    const result = validateCursorPayload(
      basePayload({
        event_type: "chat",
        model: "claude-sonnet-4-20250514",
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        metadata: {
          cursor_session_id: "cmp-123",
          workspace: "/tmp/repo",
          workspace_scope: "global",
          cost_model: HOOK_COST_MODEL,
          scannable: false,
          risk_level: "none",
          ingest_source: "cursor_hook",
          hook_event_name: "sessionEnd",
          generation_id: "gen-123",
          session_id: "cursor:hook:cmp-123:gen-123:sessionEnd",
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.path).toBe("cursor_hook");
  });

  it("rejects cursor hook payloads with mismatched ingest_source", () => {
    const result = validateCursorPayload(
      basePayload({
        event_type: "chat",
        model: "claude-sonnet-4-20250514",
        metadata: {
          cursor_session_id: "cmp-123",
          workspace: "/tmp/repo",
          workspace_scope: "global",
          cost_model: HOOK_COST_MODEL,
          scannable: false,
          risk_level: "none",
          ingest_source: "not_cursor_hook",
          hook_event_name: "sessionEnd",
          generation_id: "gen-123",
          session_id: "cursor:hook:cmp-123:gen-123:sessionEnd",
        },
      })
    );

    expect(result.ok).toBe(false);
    expect(result.path).toBe("cursor_hook");
    expect(result.errors).toContain('metadata.ingest_source must be "cursor_hook"');
  });

  it("rejects unexpected top-level keys", () => {
    const payload = { ...basePayload(), extra: true } as CursorDb90Payload;
    const result = validateCursorPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unexpected key "extra"'))).toBe(true);
  });

  it("rejects commit metadata on daily tab payload", () => {
    const result = validateCursorPayload(
      basePayload({
        metadata: {
          ...basePayload().metadata,
          commit_hash: "should-not-be-here",
        },
      })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects wrong cost_model", () => {
    const result = validateCursorPayload(
      basePayload({
        metadata: {
          ...basePayload().metadata,
          cost_model: "token_counts" as "estimated_line_count",
        },
      })
    );
    expect(result.ok).toBe(false);
  });
});

describe("summarizeDryRunMatrix", () => {
  it("groups payloads by ingest path including MCP transcripts", () => {
    const matrix = summarizeDryRunMatrix([
      basePayload(),
      basePayload({ event_type: "chat" }),
      basePayload({
        event_type: "commit",
        metadata: {
          ...basePayload().metadata,
          source: "recent_commit",
          commit_hash: "x",
        },
      }),
      basePayload({
        event_type: "chat",
        metadata: {
          session_id: "turn-1",
          cursor_session_id: "sess-1",
          workspace: "/tmp/ws",
          cost_model: "estimated_transcript_text",
          scannable: true,
          risk_level: "none",
          transcript_source: "agent_transcript",
        },
      }),
      basePayload({
        event_type: "chat",
        model: "claude-sonnet-4-20250514",
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        metadata: {
          cursor_session_id: "cmp-123",
          workspace: "/tmp/ws",
          workspace_scope: "global",
          cost_model: HOOK_COST_MODEL,
          scannable: false,
          risk_level: "none",
          ingest_source: "cursor_hook",
          hook_event_name: "sessionEnd",
          generation_id: "gen-123",
          session_id: "cursor:hook:cmp-123:gen-123:sessionEnd",
        },
      }),
    ]);
    expect(matrix.map((r) => r.path)).toEqual([
      "daily_tab",
      "daily_composer",
      "recent_commit",
      "mcp_transcript",
      "cursor_hook",
    ]);
    expect(inferIngestPath(basePayload())).toBe("daily_tab");
  });
});
