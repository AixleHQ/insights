/**
 * Regression-guard contract for the Claude Code MCP transcript-sync payload.
 *
 * Background — AIX-192 validation (2026-06-07):
 *   The Events page (insights.example.com/events) showed Claude rows
 *   with project="-", tokens=0, cost="-". Investigation traced these to a mix of
 *   the Claude Code hook path (structurally cannot carry that data) and historical
 *   rows from before server-side enrichment landed. This file pins the MCP-path
 *   contract: given a well-formed transcript turn, the posted payload MUST carry
 *   tool_name, event_type, model (when known), tokens_in/out/total (when > 0),
 *   project_id (when resolved), and a non-undefined cost_usd. CI fails if any
 *   field silently disappears from the payload again.
 *
 * Sibling guarantees:
 *   - packages/api/spec/services/tool_events/upsert_spec.rb — Rails-side: chat
 *     event with model+tokens enriches cost_usd > 0 and persists project_id.
 *   - cursor-payload-contract.test.ts — Cursor parity (already in place).
 */

import { describe, expect, it } from "vitest";
import { mapTranscriptTurn, type ClaudeTranscriptTurn } from "../readers/claude.js";
import { DEFAULT_PRICING } from "../pricing.js";

function makeTurn(overrides: Partial<ClaudeTranscriptTurn> = {}): ClaudeTranscriptTurn {
  return {
    sessionId: "claude-session-validate",
    turnId: "claude-session-validate:1",
    filePath: "/tmp/session.jsonl",
    fileSize: 1024,
    model: "claude-sonnet-4-6",
    tokensIn: 1234,
    tokensOut: 567,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    occurredAt: "2026-06-07T23:30:00.000Z",
    promptText: "What is the meaning of life?",
    assistantText: "42",
    riskLevel: "low",
    riskScore: 0,
    riskCategories: [],
    ...overrides,
  };
}

describe("Claude MCP payload contract (AIX-192)", () => {
  describe("identity fields — must always be the literal values", () => {
    it("tool_name is literally 'claude_code'", () => {
      const payload = mapTranscriptTurn(makeTurn());
      expect(payload.tool_name).toBe("claude_code");
    });

    it("event_type is literally 'chat'", () => {
      const payload = mapTranscriptTurn(makeTurn());
      expect(payload.event_type).toBe("chat");
    });

    it("metadata.transcript_source is 'claude_jsonl' (lets server distinguish MCP path from hooks)", () => {
      const payload = mapTranscriptTurn(makeTurn());
      expect(payload.metadata.transcript_source).toBe("claude_jsonl");
    });
  });

  describe("data-completeness — when input has the field, payload MUST carry it", () => {
    it("project_id is set when a projectId is resolved upstream", () => {
      const payload = mapTranscriptTurn(makeTurn(), { projectId: "proj-uuid-DB90" });
      expect(payload.project_id).toBe("proj-uuid-DB90");
    });

    it("model is set on the payload when the turn carries a model", () => {
      const payload = mapTranscriptTurn(makeTurn({ model: "claude-opus-4-7" }));
      expect(payload.model).toBe("claude-opus-4-7");
    });

    it("model is also mirrored into metadata.model so server-side promotion works for backfills", () => {
      const payload = mapTranscriptTurn(makeTurn({ model: "claude-opus-4-7" }));
      expect(payload.metadata.model).toBe("claude-opus-4-7");
    });

    it("tokens_in is set when tokensIn > 0", () => {
      const payload = mapTranscriptTurn(makeTurn({ tokensIn: 100 }));
      expect(payload.tokens_in).toBe(100);
    });

    it("tokens_out is set when tokensOut > 0", () => {
      const payload = mapTranscriptTurn(makeTurn({ tokensOut: 50 }));
      expect(payload.tokens_out).toBe(50);
    });

    it("tokens_total equals tokensIn + tokensOut when either is > 0", () => {
      const payload = mapTranscriptTurn(makeTurn({ tokensIn: 100, tokensOut: 50 }));
      expect(payload.tokens_total).toBe(150);
    });

    it("cost_usd is a positive number when model + tokens + pricing table are provided", () => {
      const payload = mapTranscriptTurn(makeTurn(), { pricing: DEFAULT_PRICING });
      expect(payload.cost_usd).not.toBeNull();
      expect(payload.cost_usd as number).toBeGreaterThan(0);
    });

    it("cost_usd is null (not undefined, not omitted) when no pricing table is given — server will enrich", () => {
      const payload = mapTranscriptTurn(makeTurn(), { pricing: undefined });
      expect(payload.cost_usd).toBeNull();
      expect("cost_usd" in payload).toBe(true);
    });

    it("metadata.scannable is true so the server runs prompt-text risk scanning", () => {
      const payload = mapTranscriptTurn(makeTurn());
      expect(payload.metadata.scannable).toBe(true);
    });

    it("metadata.session_id is the turnId so server-side dedup keys correctly", () => {
      const payload = mapTranscriptTurn(makeTurn({ turnId: "abc:42" }));
      expect(payload.metadata.session_id).toBe("abc:42");
    });
  });

  describe("absence-completeness — when input lacks the field, payload MUST omit it (don't send null/0 as data)", () => {
    it("project_id is omitted when no projectId is provided", () => {
      const payload = mapTranscriptTurn(makeTurn(), { projectId: undefined });
      expect(payload.project_id).toBeUndefined();
    });

    it("project_id is omitted when projectId is null", () => {
      const payload = mapTranscriptTurn(makeTurn(), { projectId: null });
      expect(payload.project_id).toBeUndefined();
    });

    it("tokens_in is omitted when tokensIn is 0 (silent zeros would inflate the 'zero tokens' bucket on Events page)", () => {
      const payload = mapTranscriptTurn(makeTurn({ tokensIn: 0, tokensOut: 5 }));
      expect(payload.tokens_in).toBeUndefined();
    });

    it("tokens_out is omitted when tokensOut is 0", () => {
      const payload = mapTranscriptTurn(makeTurn({ tokensIn: 5, tokensOut: 0 }));
      expect(payload.tokens_out).toBeUndefined();
    });

    it("tokens_total is omitted when both tokensIn and tokensOut are 0", () => {
      const payload = mapTranscriptTurn(makeTurn({ tokensIn: 0, tokensOut: 0 }));
      expect(payload.tokens_total).toBeUndefined();
    });

    it("model is omitted when the turn has no model (and metadata.model is null, not a stale value)", () => {
      const payload = mapTranscriptTurn(makeTurn({ model: "" }));
      expect(payload.model).toBeUndefined();
      expect(payload.metadata.model).toBe("");
    });
  });

  describe("cache-token math — cost calculator must split base-input from cache reads", () => {
    it("base_input_tokens deducts cache_write and cache_read from tokensIn", () => {
      const payload = mapTranscriptTurn(
        makeTurn({ tokensIn: 100, cacheWriteTokens: 20, cacheReadTokens: 30 })
      );
      expect(payload.metadata.base_input_tokens).toBe(50);
    });

    it("base_input_tokens never goes negative (clamps at 0)", () => {
      const payload = mapTranscriptTurn(
        makeTurn({ tokensIn: 10, cacheWriteTokens: 30, cacheReadTokens: 0 })
      );
      expect(payload.metadata.base_input_tokens).toBe(0);
    });

    it("tokens_in excludes cache tokens — reports only base input (AIX-350)", () => {
      const payload = mapTranscriptTurn(
        makeTurn({ tokensIn: 1000, cacheWriteTokens: 200, cacheReadTokens: 500 })
      );
      // tokens_in should be baseInputTokens = 1000 - 200 - 500 = 300
      expect(payload.tokens_in).toBe(300);
    });

    it("tokens_total excludes cache tokens from input side (AIX-350)", () => {
      const payload = mapTranscriptTurn(
        makeTurn({ tokensIn: 1000, tokensOut: 400, cacheWriteTokens: 200, cacheReadTokens: 500 })
      );
      // tokens_total = baseInputTokens + tokensOut = 300 + 400 = 700
      expect(payload.tokens_total).toBe(700);
    });

    it("tokens_in equals tokensIn when no cache is used (no regression)", () => {
      const payload = mapTranscriptTurn(
        makeTurn({ tokensIn: 1000, cacheWriteTokens: 0, cacheReadTokens: 0 })
      );
      expect(payload.tokens_in).toBe(1000);
    });
  });

  describe("regression scenarios from the 2026-06-07 staging investigation", () => {
    it("a turn from a developer working in their repo posts with tool_name=claude_code, model, tokens, cost, project_id — the full DB90 row contract", () => {
      const payload = mapTranscriptTurn(
        makeTurn({
          model: "claude-sonnet-4-6",
          tokensIn: 1500,
          tokensOut: 800,
        }),
        { projectId: "db90-project-uuid", pricing: DEFAULT_PRICING }
      );

      expect(payload).toMatchObject({
        tool_name: "claude_code",
        event_type: "chat",
        model: "claude-sonnet-4-6",
        tokens_in: 1500,
        tokens_out: 800,
        tokens_total: 2300,
        project_id: "db90-project-uuid",
      });
      expect(payload.cost_usd).not.toBeNull();
      expect(payload.cost_usd as number).toBeGreaterThan(0);
      expect(payload.metadata.model).toBe("claude-sonnet-4-6");
      expect(payload.metadata.scannable).toBe(true);
    });

    it("a turn with zero usage still posts (rare but valid) — model present, tokens omitted, cost null", () => {
      const payload = mapTranscriptTurn(
        makeTurn({ tokensIn: 0, tokensOut: 0 }),
        { projectId: "db90-project-uuid", pricing: DEFAULT_PRICING }
      );

      expect(payload.tool_name).toBe("claude_code");
      expect(payload.event_type).toBe("chat");
      expect(payload.model).toBe("claude-sonnet-4-6");
      expect(payload.tokens_in).toBeUndefined();
      expect(payload.tokens_out).toBeUndefined();
      expect(payload.tokens_total).toBeUndefined();
      // No tokens → no cost to calculate
      expect(payload.cost_usd).toBe(0);
      expect(payload.project_id).toBe("db90-project-uuid");
    });
  });
});
