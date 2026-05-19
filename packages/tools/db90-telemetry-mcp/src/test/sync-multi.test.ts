import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRICING } from "../pricing.js";
import { readState } from "../state.js";

const mocks = vi.hoisted(() => ({
  findTranscriptFiles: vi.fn(),
  parseTranscriptFile: vi.fn(),
  toDb90Payload: vi.fn(),
  readCursorEvents: vi.fn(),
  readDailyStats: vi.fn(),
  readRecentCommitSnapshots: vi.fn(),
  mapCursorEvent: vi.fn(),
  mapDailyStats: vi.fn(),
  mapRecentCommit: vi.fn(),
  postEvent: vi.fn(),
}));

vi.mock("../readers/claude.js", () => ({
  findTranscriptFiles: mocks.findTranscriptFiles,
  parseTranscriptFile: mocks.parseTranscriptFile,
  toDb90Payload: mocks.toDb90Payload,
}));

vi.mock("../readers/cursor.js", () => ({
  readEvents: mocks.readCursorEvents,
  readDailyStats: mocks.readDailyStats,
  readRecentCommitSnapshots: mocks.readRecentCommitSnapshots,
  mapEvent: mocks.mapCursorEvent,
  mapDailyStats: mocks.mapDailyStats,
  mapRecentCommit: mocks.mapRecentCommit,
  DEFAULT_CURSOR_PRICING: {
    tokens_per_line: 15,
    completion_output_per_mtok: 0.6,
    chat_input_per_mtok: 3.0,
    chat_output_per_mtok: 15.0,
  },
}));

vi.mock("../client.js", () => ({
  postEvent: mocks.postEvent,
}));

import {
  CURSOR_DAILY_STATS_WATERMARK_KEY,
  CURSOR_EVENTS_WATERMARK_KEY,
  CURSOR_RECENT_COMMIT_WATERMARK_KEY,
  sessionStateKey,
  syncTelemetryTools,
} from "../sync.js";

describe("syncTelemetryTools", () => {
  let appDir: string;
  const host = "http://localhost:3000";

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), "db90-mcp-sync-multi-"));
    mkdirSync(appDir, { recursive: true });
    vi.clearAllMocks();
    mocks.findTranscriptFiles.mockReturnValue([]);
    mocks.parseTranscriptFile.mockResolvedValue(new Map());
    mocks.toDb90Payload.mockReturnValue(null);
    mocks.readCursorEvents.mockReturnValue([]);
    mocks.readDailyStats.mockReturnValue([]);
    mocks.readRecentCommitSnapshots.mockReturnValue([]);
    mocks.mapCursorEvent.mockReturnValue(null);
    mocks.mapDailyStats.mockReturnValue([]);
    mocks.mapRecentCommit.mockReturnValue(null);
    mocks.postEvent.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not advance the cursor events watermark when a cursor event fails", async () => {
    mocks.readCursorEvents.mockReturnValue([
      { row: { requestId: "r1" }, workspacePath: "/tmp/ws" },
      { row: { requestId: "r2" }, workspacePath: "/tmp/ws" },
    ]);
    mocks.mapCursorEvent
      .mockReturnValueOnce({
        tool_name: "cursor",
        event_type: "chat",
        model: "gpt-4.1",
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: 0.1,
        occurred_at: "2026-05-19T10:00:00.000Z",
        metadata: { cursor_session_id: null, workspace: "/tmp/ws", cost_model: "estimated_line_count", scannable: false, risk_level: "none" },
      })
      .mockReturnValueOnce({
        tool_name: "cursor",
        event_type: "chat",
        model: "gpt-4.1",
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: 0.1,
        occurred_at: "2026-05-19T12:00:00.000Z",
        metadata: { cursor_session_id: null, workspace: "/tmp/ws", cost_model: "estimated_line_count", scannable: false, risk_level: "none" },
      });
    mocks.postEvent.mockResolvedValue(false);

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: "db90_cursor_token" } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);

    const state = readState(appDir, host, "db90_cursor_token");
    expect(state.sessions[CURSOR_EVENTS_WATERMARK_KEY]).toBeUndefined();
  });

  it("tracks cursor daily stats independently from recent commit watermarks", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readRecentCommitSnapshots.mockImplementation((since: Date | null) =>
      since === null ? [{ value: { timestamp: 1747645200000 }, dbPath: "/tmp/state.vscdb" }] : []
    );
    mocks.mapRecentCommit.mockReturnValue({
      tool_name: "cursor",
      event_type: "chat",
      model: "unknown",
      tokens_in: 3,
      tokens_out: 1,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T09:00:00.000Z",
      metadata: {
        cursor_session_id: null,
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
        source: "recent_commit",
      },
    });

    await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    mocks.postEvent.mockClear();
    mocks.readRecentCommitSnapshots.mockReturnValue([]);
    mocks.readDailyStats.mockImplementation((since: Date | null) => {
      expect(since).toBeNull();
      return [{ date: "2026-05-19", value: { tabSuggestedLines: 5, tabAcceptedLines: 2 }, dbPath: "/tmp/state.vscdb" }];
    });
    mocks.mapDailyStats.mockReturnValue([
      {
        tool_name: "cursor",
        event_type: "completion",
        model: "unknown",
        tokens_in: 5,
        tokens_out: 2,
        cost_usd: 0.1,
        occurred_at: "2026-05-19T00:00:00.000Z",
        metadata: { cursor_session_id: null, workspace: "/tmp/state.vscdb", cost_model: "estimated_line_count", scannable: false, risk_level: "none" },
      },
    ]);

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(result.sent).toBe(1);
    const state = readState(appDir, host, cursorToken);
    expect(state.sessions[CURSOR_RECENT_COMMIT_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T09:00:00.000Z");
    expect(state.sessions[CURSOR_DAILY_STATS_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T00:00:00.000Z");
  });

  it("preserves both Claude and Cursor checkpoints when both tools share one token", async () => {
    const sharedToken = "db90_shared_token";
    mocks.findTranscriptFiles.mockReturnValue(["/tmp/session.jsonl"]);
    mocks.parseTranscriptFile.mockResolvedValue(
      new Map([
        [
          "sess-1",
          {
            sessionId: "sess-1",
            filePath: "/tmp/session.jsonl",
            fileSize: 123,
            model: "claude-sonnet-4",
            tokensIn: 10,
            tokensOut: 5,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            occurredAt: "2026-05-19T11:00:00.000Z",
            riskLevel: "low",
            riskScore: 0,
            riskCategories: [],
          },
        ],
      ])
    );
    mocks.toDb90Payload.mockReturnValue({
      tool_name: "claude_code",
      event_type: "chat",
      model: "claude-sonnet-4",
      tokens_in: 10,
      tokens_out: 5,
      tokens_total: 15,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T11:00:00.000Z",
      metadata: {
        session_id: "sess-1",
        model: "claude-sonnet-4",
        base_input_tokens: 10,
        output_tokens: 5,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        risk_level: "low",
        risk_categories: [],
        risk_score: 0,
        scannable: true,
      },
    });
    mocks.readCursorEvents.mockReturnValue([{ row: { requestId: "r1" }, workspacePath: "/tmp/ws" }]);
    mocks.mapCursorEvent.mockReturnValue({
      tool_name: "cursor",
      event_type: "chat",
      model: "gpt-4.1",
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T12:00:00.000Z",
      metadata: { cursor_session_id: null, workspace: "/tmp/ws", cost_model: "estimated_line_count", scannable: false, risk_level: "none" },
    });
    mocks.postEvent.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return true;
    });

    const result = await syncTelemetryTools({
      credentials: {
        host,
        accounts: {
          claude_code: sharedToken,
          cursor: sharedToken,
        },
      },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
    });

    expect(result.failed).toBe(0);
    expect(result.sent).toBe(2);
    const state = readState(appDir, host, sharedToken);
    expect(state.sessions[sessionStateKey("sess-1")]).toBeDefined();
    expect(state.sessions[CURSOR_EVENTS_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T12:00:00.000Z");
  });
});
