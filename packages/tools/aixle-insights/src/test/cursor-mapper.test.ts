import { describe, it, expect } from "vitest";
import { mapEvent, mapDailyStats, mapRecentCommit, mapTranscriptTurn, DEFAULT_CURSOR_PRICING } from "../readers/cursor.js";
import type { CursorRow, PricingConfig, DailyStatsEntry, RecentCommitSnapshot, CursorTranscriptTurn } from "../readers/cursor.js";

describe("mapEvent", () => {
  const workspace = "/home/user/projects/myapp";

  it("maps a completion event (type=0) correctly", () => {
    const row: CursorRow = {
      requestId: "req-abc-123",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: 100,
      generatedTokens: 50,
      type: 0,
      sessionId: "session-xyz",
    };

    const result = mapEvent(row, workspace);

    expect(result).not.toBeNull();
    expect(result!.tool_name).toBe("cursor");
    expect(result!.event_type).toBe("completion");
    expect(result!.model).toBe("gpt-4");
    expect(result!.tokens_in).toBe(100);
    expect(result!.tokens_out).toBe(50);
    expect(result!.occurred_at).toBe(new Date(1700000000000).toISOString());
    expect(result!.metadata.cursor_session_id).toBe("session-xyz");
    expect(result!.metadata.workspace).toBe(workspace);
    expect(result!.cost_usd).toBeTypeOf("number");
    expect(result!.metadata.cost_model).toBe("token_count");
    expect(result!.metadata.scannable).toBe(false);
    expect(result!.metadata.risk_level).toBe("none");
  });

  it("maps a chat event (type=1) correctly", () => {
    const row: CursorRow = {
      requestId: "req-def-456",
      timestamp: 1700000001000,
      model: "claude-3-sonnet",
      promptTokens: 200,
      generatedTokens: 80,
      type: 1,
      sessionId: null,
    };

    const result = mapEvent(row, workspace);

    expect(result).not.toBeNull();
    expect(result!.event_type).toBe("chat");
    expect(result!.model).toBe("claude-3-sonnet");
    expect(result!.metadata.cursor_session_id).toBe("req-def-456");
    expect(result!.cost_usd).toBeTypeOf("number");
    expect(result!.metadata.cost_model).toBe("token_count");
    expect(result!.metadata.scannable).toBe(false);
    expect(result!.metadata.risk_level).toBe("none");
  });

  it("handles timestamps in seconds (< 1e12)", () => {
    const row: CursorRow = {
      requestId: "req-sec",
      timestamp: 1700000000,
      model: "gpt-3.5-turbo",
      promptTokens: 10,
      generatedTokens: 5,
      type: 0,
    };

    const result = mapEvent(row, workspace);

    expect(result).not.toBeNull();
    expect(result!.occurred_at).toBe(new Date(1700000000 * 1000).toISOString());
    expect(result!.cost_usd).toBeTypeOf("number");
    expect(result!.metadata.cost_model).toBe("token_count");
  });

  it("returns null when timestamp is missing", () => {
    const row: CursorRow = {
      requestId: "req-no-ts",
      timestamp: null,
      model: "gpt-4",
      promptTokens: 10,
      generatedTokens: 5,
      type: 0,
    };

    expect(mapEvent(row, workspace)).toBeNull();
  });

  it("returns null when model is missing", () => {
    const row: CursorRow = {
      requestId: "req-no-model",
      timestamp: 1700000000000,
      model: null,
      promptTokens: 10,
      generatedTokens: 5,
      type: 0,
    };

    expect(mapEvent(row, workspace)).toBeNull();
  });

  it("defaults tokens to 0 when null", () => {
    const row: CursorRow = {
      requestId: "req-no-tokens",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: null,
      generatedTokens: null,
      type: 0,
    };

    const result = mapEvent(row, workspace);
    expect(result).not.toBeNull();
    expect(result!.tokens_in).toBe(0);
    expect(result!.tokens_out).toBe(0);
    expect(result!.cost_usd).toBe(0);
    expect(result!.metadata.cost_model).toBe("token_count");
  });

  it("falls back to requestId for session_id when sessionId is null", () => {
    const row: CursorRow = {
      requestId: "req-fallback",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: 5,
      generatedTokens: 2,
      type: 0,
      sessionId: null,
    };

    const result = mapEvent(row, workspace);
    expect(result).not.toBeNull();
    expect(result!.metadata.cursor_session_id).toBe("req-fallback");
    expect(result!.cost_usd).toBeTypeOf("number");
    expect(result!.metadata.cost_model).toBe("token_count");
  });

  it("treats type=undefined as completion", () => {
    const row: CursorRow = {
      requestId: "req-undef-type",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: 5,
      generatedTokens: 2,
    };

    const result = mapEvent(row, workspace);
    expect(result).not.toBeNull();
    expect(result!.event_type).toBe("completion");
    expect(result!.cost_usd).toBeTypeOf("number");
    expect(result!.metadata.cost_model).toBe("token_count");
  });

  it("sets cost_usd to 0 when tokens are zero (completion, type=0)", () => {
    const row: CursorRow = {
      requestId: "r",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: 0,
      generatedTokens: 0,
      type: 0,
    };

    const result = mapEvent(row, workspace);
    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBe(0);
    expect(result!.metadata.cost_model).toBe("token_count");
    const resultChat = mapEvent({ ...row, type: 1 }, workspace);
    expect(resultChat!.cost_usd).toBe(0);
  });

  it("includes projectId on the payload when provided", () => {
    const row: CursorRow = {
      requestId: "req-with-pid",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: 10,
      generatedTokens: 5,
      type: 0,
    };
    const result = mapEvent(row, workspace, "proj-uuid-456");
    expect(result).not.toBeNull();
    expect(result!.project_id).toBe("proj-uuid-456");
  });

  it("omits project_id when projectId is not provided", () => {
    const row: CursorRow = {
      requestId: "req-no-pid",
      timestamp: 1700000000000,
      model: "gpt-4",
      promptTokens: 10,
      generatedTokens: 5,
      type: 0,
    };
    const result = mapEvent(row, workspace);
    expect(result).not.toBeNull();
    expect(result!.project_id).toBeUndefined();
  });
});

describe("mapDailyStats", () => {
  const dbPath = "/path/to/state.vscdb";

  it("maps current Cursor v1.5 line-count layout (tab + composer)", () => {
    const entry: DailyStatsEntry = {
      date: "2026-02-09",
      dbPath,
      value: { date: "2026-02-09", tabSuggestedLines: 6, tabAcceptedLines: 2, composerSuggestedLines: 43, composerAcceptedLines: 50 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(2);

    const tab = results.find((r) => r.event_type === "completion")!;
    expect(tab.tokens_in).toBe(6);
    expect(tab.tokens_out).toBe(2);
    expect(tab.occurred_at).toBe("2026-02-09T00:00:00.000Z");
    expect(tab.cost_usd).toBeTypeOf("number");
    expect(tab.metadata.cost_model).toBe("estimated_line_count");
    expect(tab.metadata.scannable).toBe(false);
    expect(tab.metadata.risk_level).toBe("none");
    expect(tab.metadata.session_id).toBe("cursor:daily_stats:2026-02-09:completion");

    const composer = results.find((r) => r.event_type === "chat")!;
    expect(composer.tokens_in).toBe(43);
    expect(composer.tokens_out).toBe(50);
    expect(composer.cost_usd).toBeTypeOf("number");
    expect(composer.metadata.cost_model).toBe("estimated_line_count");
    expect(composer.metadata.scannable).toBe(false);
    expect(composer.metadata.risk_level).toBe("none");
    expect(composer.metadata.session_id).toBe("cursor:daily_stats:2026-02-09:chat");
  });

  it("emits only tab event when composer counts are zero", () => {
    const entry: DailyStatsEntry = {
      date: "2026-03-03",
      dbPath,
      value: { tabSuggestedLines: 12, tabAcceptedLines: 10, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].event_type).toBe("completion");
    expect(results[0].cost_usd).toBeTypeOf("number");
    expect(results[0].metadata.cost_model).toBe("estimated_line_count");
  });

  it("emits only composer event when tab counts are zero", () => {
    const entry: DailyStatsEntry = {
      date: "2026-02-19",
      dbPath,
      value: { tabSuggestedLines: 0, tabAcceptedLines: 0, composerSuggestedLines: 63, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].event_type).toBe("chat");
    expect(results[0].cost_usd).toBeTypeOf("number");
    expect(results[0].metadata.cost_model).toBe("estimated_line_count");
  });

  it("returns empty array when all counts are zero", () => {
    const entry: DailyStatsEntry = {
      date: "2026-01-01",
      dbPath,
      value: { tabSuggestedLines: 0, tabAcceptedLines: 0, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    expect(mapDailyStats(entry)).toHaveLength(0);
  });

  it("falls back to model-keyed token layout", () => {
    const entry: DailyStatsEntry = {
      date: "2026-01-01",
      dbPath,
      value: { "claude-3-5-sonnet": { inputTokens: 5000, outputTokens: 1200 } },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].model).toBe("claude-3-5-sonnet");
    expect(results[0].tokens_in).toBe(5000);
    expect(results[0].tokens_out).toBe(1200);
    expect(results[0].cost_usd).toBeTypeOf("number");
    expect(results[0].metadata.cost_model).toBe("token_count");
    expect(results[0].metadata.session_id).toBe("cursor:daily_stats:2026-01-01:chat:claude-3-5-sonnet");
  });

  it("returns empty array for unknown shape", () => {
    const entry: DailyStatsEntry = { date: "2026-01-01", dbPath, value: { foo: "bar" } };
    expect(mapDailyStats(entry)).toHaveLength(0);
  });

  it("computes tab completion cost from line count using default pricing", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-01",
      dbPath,
      value: { tabSuggestedLines: 100, tabAcceptedLines: 80, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].event_type).toBe("completion");
    expect(results[0].cost_usd).toBeCloseTo(0.0009, 10);
  });

  it("computes composer chat cost from line count using default pricing", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-01",
      dbPath,
      value: { tabSuggestedLines: 0, tabAcceptedLines: 0, composerSuggestedLines: 100, composerAcceptedLines: 60 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].event_type).toBe("chat");
    expect(results[0].cost_usd).toBeCloseTo(0.0315, 10);
  });

  it("uses custom PricingConfig rates when provided", () => {
    const customPricing: PricingConfig = {
      tokens_per_line: 10,
      completion_output_per_mtok: 1.0,
      chat_input_per_mtok: 2.0,
      chat_output_per_mtok: 10.0,
    };
    const entry: DailyStatsEntry = {
      date: "2026-04-01",
      dbPath,
      value: { tabSuggestedLines: 50, tabAcceptedLines: 40, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry, undefined, customPricing);
    expect(results).toHaveLength(1);
    expect(results[0].cost_usd).toBeCloseTo(0.0005, 10);
    const defaultResults = mapDailyStats(entry);
    expect(results[0].cost_usd).not.toBe(defaultResults[0].cost_usd);
  });

  it("threads projectId into emitted payloads when provided", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { tabSuggestedLines: 5, tabAcceptedLines: 1, composerSuggestedLines: 7, composerAcceptedLines: 4 },
    };
    const results = mapDailyStats(entry, "proj-uuid-123");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.project_id === "proj-uuid-123")).toBe(true);
  });

  it("passes model param to tab and composer payloads", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { tabSuggestedLines: 5, tabAcceptedLines: 1, composerSuggestedLines: 7, composerAcceptedLines: 4 },
    };
    const results = mapDailyStats(entry, undefined, DEFAULT_CURSOR_PRICING, "claude-4-sonnet");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.model === "claude-4-sonnet")).toBe(true);
  });

  it("defaults model to unknown when not provided", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { tabSuggestedLines: 5, tabAcceptedLines: 1, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].model).toBe("unknown");
  });

  it("omits project_id when no projectId is provided", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { tabSuggestedLines: 5, tabAcceptedLines: 1, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry);
    expect(results).toHaveLength(1);
    expect(results[0].project_id).toBeUndefined();
  });

  it("clamps negative pricing rates to zero (defensive — no negative cost can leak)", () => {
    const malformed: PricingConfig = {
      tokens_per_line: -15,
      completion_output_per_mtok: -0.6,
      chat_input_per_mtok: -3.0,
      chat_output_per_mtok: -15.0,
    };
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { tabSuggestedLines: 100, tabAcceptedLines: 50, composerSuggestedLines: 100, composerAcceptedLines: 60 },
    };
    const results = mapDailyStats(entry, undefined, malformed);
    expect(results).toHaveLength(2);
    for (const r of results) expect(r.cost_usd).toBe(0);
  });
});

describe("mapTranscriptTurn", () => {
  it("maps a Cursor agent transcript turn into a scannable chat payload", () => {
    const turn: CursorTranscriptTurn = {
      turnId: "composer-123:1",
      sessionId: "composer-123",
      filePath: "/tmp/composer-123.jsonl",
      fileSize: 456,
      workspacePath: "/Users/test/repo",
      composerName: "Telemetry-mcp testing",
      occurredAt: "2026-05-20T09:10:00.000Z",
      promptText: "Inspect db90_status output",
      assistantText: "The db90 MCP server is not connected.",
      tokensIn: 6,
      tokensOut: 9,
      riskLevel: "low",
      riskScore: 0,
      riskCategories: [],
    };

    const payload = mapTranscriptTurn(turn);
    expect(payload.tool_name).toBe("cursor");
    expect(payload.event_type).toBe("chat");
    expect(payload.tokens_in).toBe(6);
    expect(payload.tokens_out).toBe(9);
    expect(payload.metadata.session_id).toBe("composer-123:1");
    expect(payload.metadata.cursor_session_id).toBe("composer-123");
    expect(payload.metadata.workspace).toBe("/Users/test/repo");
    expect(payload.metadata.cost_model).toBe("estimated_transcript_text");
    expect(payload.metadata.scannable).toBe(true);
    expect(payload.metadata.risk_level).toBe("low");
    expect(payload.metadata.transcript_source).toBe("agent_transcript");
    expect(payload.metadata.prompt_text).toContain("db90_status");
    expect(payload.metadata.assistant_text).toContain("not connected");
  });

  it("passes model param to transcript turn payload", () => {
    const turn: CursorTranscriptTurn = {
      turnId: "composer-456:1",
      sessionId: "composer-456",
      filePath: "/tmp/composer-456.jsonl",
      fileSize: 100,
      workspacePath: "/Users/test/repo",
      composerName: "Test session",
      occurredAt: "2026-05-20T10:00:00.000Z",
      promptText: "hello",
      assistantText: "world",
      tokensIn: 3,
      tokensOut: 4,
      riskLevel: "none",
      riskScore: 0,
      riskCategories: [],
    };
    const payload = mapTranscriptTurn(turn, undefined, DEFAULT_CURSOR_PRICING, "claude-sonnet-4-6");
    expect(payload.model).toBe("claude-sonnet-4-6");
  });

  it("defaults transcript turn model to unknown when not provided", () => {
    const turn: CursorTranscriptTurn = {
      turnId: "composer-789:1",
      sessionId: "composer-789",
      filePath: "/tmp/composer-789.jsonl",
      fileSize: 100,
      workspacePath: "/Users/test/repo",
      composerName: "Test session",
      occurredAt: "2026-05-20T10:00:00.000Z",
      promptText: "hello",
      assistantText: "world",
      tokensIn: 3,
      tokensOut: 4,
      riskLevel: "none",
      riskScore: 0,
      riskCategories: [],
    };
    expect(mapTranscriptTurn(turn).model).toBe("unknown");
  });
});

describe("mapRecentCommit", () => {
  const dbPath = "/tmp/global/state.vscdb";

  it("maps aiCodeTracking.recentCommit JSON to a commit event with metadata", () => {
    const snapshot: RecentCommitSnapshot = {
      dbPath,
      value: {
        timestamp: 1704067200000,
        commitHash: "deadbeef",
        commitMessage: "feat: hello",
        repoName: "org/repo",
        branchName: "main",
        aiPercentage: "96.43",
        linesAdded: 18,
        linesDeleted: 10,
      },
    };
    const result = mapRecentCommit(snapshot);
    expect(result).not.toBeNull();
    expect(result!.event_type).toBe("commit");
    expect(result!.metadata.source).toBe("recent_commit");
    expect(result!.metadata.commit_hash).toBe("deadbeef");
    expect(result!.metadata.commit_message).toBe("feat: hello");
    expect(result!.metadata.repo_name).toBe("org/repo");
    expect(result!.metadata.branch_name).toBe("main");
    expect(result!.metadata.ai_percentage).toBe(96.43);
    expect(result!.tokens_in).toBe(18);
    expect(result!.tokens_out).toBe(10);
    expect(result!.occurred_at).toBe(new Date(1704067200000).toISOString());
    expect(result!.metadata.cost_model).toBe("estimated_line_count");
    // Same line-cost path as pre-fix (computeLineCost("chat", …)) — only event_type label changed.
    // linesAddedProxy + linesDeletedProxy = 28 → 28 × 15 × (15 + 3×2) / 1e6 = 0.00882
    expect(result!.cost_usd).toBeCloseTo(0.00882, 10);
  });

  it("returns null when timestamp is missing or invalid", () => {
    const snapshot: RecentCommitSnapshot = { dbPath, value: { commitHash: "x" } };
    expect(mapRecentCommit(snapshot)).toBeNull();
  });

  it("returns null when all line counts are zero", () => {
    const snapshot: RecentCommitSnapshot = {
      dbPath,
      value: { timestamp: 1704067200000, commitHash: "abc" },
    };
    expect(mapRecentCommit(snapshot)).toBeNull();
  });

  it("passes model param to commit payload", () => {
    const snapshot: RecentCommitSnapshot = {
      dbPath,
      value: {
        timestamp: 1704067200000,
        commitHash: "deadbeef",
        linesAdded: 18,
        linesDeleted: 10,
      },
    };
    const result = mapRecentCommit(snapshot, undefined, DEFAULT_CURSOR_PRICING, "claude-4-sonnet");
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-4-sonnet");
  });

  it("defaults model to unknown when not provided", () => {
    const snapshot: RecentCommitSnapshot = {
      dbPath,
      value: {
        timestamp: 1704067200000,
        commitHash: "deadbeef",
        linesAdded: 18,
        linesDeleted: 10,
      },
    };
    const result = mapRecentCommit(snapshot);
    expect(result).not.toBeNull();
    expect(result!.model).toBe("unknown");
  });
});

describe("mapEvent — security / numeric abuse", () => {
  const workspace = "/home/user/projects/myapp";
  const baseRow: CursorRow = {
    requestId: "req-security",
    timestamp: 1700000000000,
    model: "gpt-4",
    type: 0,
  };

  it("negative promptTokens produces cost_usd >= 0", () => {
    const row: CursorRow = { ...baseRow, promptTokens: -1_000_000, generatedTokens: 100 };
    const result = mapEvent(row, workspace, undefined, DEFAULT_CURSOR_PRICING);
    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("negative generatedTokens produces cost_usd >= 0", () => {
    const row: CursorRow = { ...baseRow, promptTokens: 100, generatedTokens: -1_000_000 };
    const result = mapEvent(row, workspace, undefined, DEFAULT_CURSOR_PRICING);
    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("both negative token counts produce cost_usd === 0", () => {
    const row: CursorRow = { ...baseRow, promptTokens: -500, generatedTokens: -500 };
    const result = mapEvent(row, workspace, undefined, DEFAULT_CURSOR_PRICING);
    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBe(0);
  });

  it("NaN promptTokens: cost_usd is 0 (Math.max(0, NaN) === 0)", () => {
    const row: CursorRow = { ...baseRow, promptTokens: Number.NaN, generatedTokens: 100 };
    const result = mapEvent(row, workspace, undefined, DEFAULT_CURSOR_PRICING);
    expect(result).not.toBeNull();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("NaN");
    expect(result!.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("Infinity generatedTokens: serialized payload contains no Infinity", () => {
    const row: CursorRow = { ...baseRow, promptTokens: 100, generatedTokens: Number.POSITIVE_INFINITY };
    const result = mapEvent(row, workspace, undefined, DEFAULT_CURSOR_PRICING);
    if (result !== null) {
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("Infinity");
    }
  });
});

describe("mapDailyStats — security / numeric abuse", () => {
  const dbPath = "/path/to/state.vscdb";

  it("negative tabSuggestedLines: cost_usd is >= 0", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { tabSuggestedLines: -1000, tabAcceptedLines: 50, composerSuggestedLines: 0, composerAcceptedLines: 0 },
    };
    const results = mapDailyStats(entry, undefined, DEFAULT_CURSOR_PRICING);
    for (const r of results) expect(r.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("__proto__ injection in DailyStatsEntry value does not pollute Object.prototype", () => {
    const entry: DailyStatsEntry = {
      date: "2026-04-15",
      dbPath,
      value: { "__proto__": { polluted: true }, tabSuggestedLines: 10, tabAcceptedLines: 5 },
    };
    mapDailyStats(entry, undefined, DEFAULT_CURSOR_PRICING);
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>)["polluted"];
  });
});
