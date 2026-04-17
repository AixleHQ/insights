import { describe, it, expect } from "vitest";
import { mapEvent, mapDailyStats } from "../mapper.js";
import type { CursorRow } from "../mapper.js";
import type { DailyStatsEntry } from "../cursor-reader.js";

describe("mapEvent", () => {
  const workspace = "/home/user/projects/myapp";

  it("maps a completion event (type=0) correctly", () => {
    const row: CursorRow = {
      requestId: "req-abc-123",
      timestamp: 1700000000000, // ms
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
  });

  it("handles timestamps in seconds (< 1e12)", () => {
    const row: CursorRow = {
      requestId: "req-sec",
      timestamp: 1700000000, // seconds
      model: "gpt-3.5-turbo",
      promptTokens: 10,
      generatedTokens: 5,
      type: 0,
    };

    const result = mapEvent(row, workspace);

    expect(result).not.toBeNull();
    expect(result!.occurred_at).toBe(new Date(1700000000 * 1000).toISOString());
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

    const composer = results.find((r) => r.event_type === "chat")!;
    expect(composer.tokens_in).toBe(43);
    expect(composer.tokens_out).toBe(50);
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
  });

  it("returns empty array for unknown shape", () => {
    const entry: DailyStatsEntry = { date: "2026-01-01", dbPath, value: { foo: "bar" } };
    expect(mapDailyStats(entry)).toHaveLength(0);
  });
});
