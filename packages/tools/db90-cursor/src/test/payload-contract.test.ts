import { describe, expect, it } from "vitest";
import type { Db90Payload } from "../mapper.js";
import {
  inferIngestPath,
  summarizeDryRunMatrix,
  validateCursorPayload,
} from "../payload-contract.js";

function basePayload(overrides: Partial<Db90Payload> = {}): Db90Payload {
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

  it("rejects unexpected top-level keys", () => {
    const payload = { ...basePayload(), extra: true } as Db90Payload;
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
  it("groups payloads by ingest path", () => {
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
    ]);
    expect(matrix.map((r) => r.path)).toEqual(["daily_tab", "daily_composer", "recent_commit"]);
    expect(inferIngestPath(basePayload())).toBe("daily_tab");
  });
});
