import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRICING } from "../pricing.js";
import { readState, writeState } from "../state.js";

const mocks = vi.hoisted(() => ({
  findTranscriptFiles: vi.fn(),
  parseTranscriptFile: vi.fn(),
  mapClaudeTranscriptTurn: vi.fn(),
  readCursorEvents: vi.fn(),
  readDailyStats: vi.fn(),
  readRecentCommitSnapshots: vi.fn(),
  readCursorTranscriptSessions: vi.fn(),
  mapCursorEvent: vi.fn(),
  mapCursorTranscriptTurn: vi.fn(),
  mapDailyStats: vi.fn(),
  mapRecentCommit: vi.fn(),
  postEvent: vi.fn(),
}));

vi.mock("../readers/claude.js", () => ({
  findTranscriptFiles: mocks.findTranscriptFiles,
  parseTranscriptFile: mocks.parseTranscriptFile,
  mapTranscriptTurn: mocks.mapClaudeTranscriptTurn,
}));

vi.mock("../readers/cursor.js", () => ({
  readEvents: mocks.readCursorEvents,
  readDailyStatsWithDedupe: mocks.readDailyStats,
  readRecentCommitSnapshots: mocks.readRecentCommitSnapshots,
  readCursorTranscriptSessions: mocks.readCursorTranscriptSessions,
  mapEvent: mocks.mapCursorEvent,
  mapTranscriptTurn: mocks.mapCursorTranscriptTurn,
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
  postEvents: async (
    events: Array<{ occurred_at: string }>,
    host: string,
    token: string,
    options?: Record<string, unknown>
  ) => {
    const outcomes = await Promise.allSettled(
      events.map(async (event) => ({
        event,
        ok: await mocks.postEvent(event, host, token, options),
      }))
    );
    let sent = 0;
    let failed = 0;
    let lastSentAt: string | null = null;
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        failed++;
        continue;
      }
      if (outcome.value.ok) {
        sent++;
        const t = outcome.value.event.occurred_at;
        if (lastSentAt === null || t > lastSentAt) lastSentAt = t;
      } else {
        failed++;
      }
    }
    return { sent, failed, lastSentAt };
  },
}));

import {
  CURSOR_DAILY_STATS_WATERMARK_KEY,
  CURSOR_EVENTS_WATERMARK_KEY,
  CURSOR_RECENT_COMMIT_WATERMARK_KEY,
  cursorTranscriptTurnStateKey,
  sessionStateKey,
  filterRecentCommitsByHashDedup,
  syncTelemetryTools,
  resetBackoffStateForTests,
} from "../sync.js";

describe("syncTelemetryTools", () => {
  let appDir: string;
  const host = "http://localhost:3000";

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), "db90-mcp-sync-multi-"));
    process.env.DB90_MCP_HOME = appDir;
    mkdirSync(appDir, { recursive: true });
    vi.clearAllMocks();
    mocks.findTranscriptFiles.mockReturnValue([]);
    mocks.parseTranscriptFile.mockResolvedValue([]);
    mocks.mapClaudeTranscriptTurn.mockReturnValue(null);
    mocks.readCursorEvents.mockReturnValue([]);
    mocks.readDailyStats.mockReturnValue({ raw: [], deduped: [] });
    mocks.readRecentCommitSnapshots.mockReturnValue([]);
    mocks.readCursorTranscriptSessions.mockResolvedValue([]);
    mocks.mapCursorEvent.mockReturnValue(null);
    mocks.mapCursorTranscriptTurn.mockReturnValue(null);
    mocks.mapDailyStats.mockReturnValue([]);
    mocks.mapRecentCommit.mockReturnValue(null);
    mocks.postEvent.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DB90_MCP_HOME;
    resetBackoffStateForTests();
  });

  it("does not advance the cursor events watermark when all cursor events fail", async () => {
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

    expect(result.failed).toBe(2);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);

    const state = readState(appDir, host, "db90_cursor_token");
    expect(state.sessions[CURSOR_EVENTS_WATERMARK_KEY]).toBeUndefined();
  });

  it("advances the cursor events watermark through partial batch failures", async () => {
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
    mocks.postEvent.mockImplementation(async (payload: { occurred_at: string }) =>
      payload.occurred_at === "2026-05-19T12:00:00.000Z"
    );

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: "db90_cursor_token" } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    const state = readState(appDir, host, "db90_cursor_token");
    expect(state.sessions[CURSOR_EVENTS_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T12:00:00.000Z");
  });

  it("tracks cursor daily stats independently from cursor event watermarks", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readCursorEvents.mockReturnValue([
      { row: { requestId: "r1" }, workspacePath: "/tmp/state.vscdb" },
    ]);
    mocks.mapCursorEvent.mockReturnValue({
      tool_name: "cursor",
      event_type: "chat",
      model: "gpt-4.1",
      tokens_in: 3,
      tokens_out: 1,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T09:00:00.000Z",
      metadata: {
        cursor_session_id: "r1",
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
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
    mocks.readCursorEvents.mockReturnValue([]);
    mocks.readDailyStats.mockImplementation((since: Date | null) => {
      expect(since).toBeNull();
      const entry = [{ date: "2026-05-19", value: { tabSuggestedLines: 5, tabAcceptedLines: 2 }, dbPath: "/tmp/state.vscdb" }];
      return { raw: entry, deduped: entry };
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
    expect(state.sessions[CURSOR_EVENTS_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T09:00:00.000Z");
    expect(state.sessions[CURSOR_DAILY_STATS_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T00:00:00.000Z");
  });

  it("checkpoints cursor transcript sessions by file size and suppresses aggregate chat duplicates", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readCursorTranscriptSessions.mockResolvedValue([
      {
        sessionId: "cursor-session-1",
        turnId: "cursor-session-1:1",
        filePath: "/tmp/cursor-session-1.jsonl",
        fileSize: 321,
        workspacePath: "/tmp/ws",
        composerName: "Telemetry-mcp testing",
        occurredAt: "2026-05-20T09:10:00.000Z",
        promptText: "Inspect db90_status output",
        assistantText: "The tool is not connected in this session.",
        tokensIn: 7,
        tokensOut: 11,
        riskLevel: "low",
        riskScore: 0,
        riskCategories: [],
      },
    ]);
    mocks.readCursorEvents.mockReturnValue([]);
    mocks.readDailyStats.mockReturnValue({
      raw: [{ date: "2026-05-20", value: { composerSuggestedLines: 12, composerAcceptedLines: 3 }, dbPath: "/tmp/state.vscdb" }],
      deduped: [{ date: "2026-05-20", value: { composerSuggestedLines: 12, composerAcceptedLines: 3 }, dbPath: "/tmp/state.vscdb" }],
    });
    mocks.mapCursorTranscriptTurn.mockReturnValue({
      tool_name: "cursor",
      event_type: "chat",
      model: "unknown",
      tokens_in: 7,
      tokens_out: 11,
      cost_usd: 0.1,
      occurred_at: "2026-05-20T09:10:00.000Z",
      metadata: {
        session_id: "cursor-session-1:1",
        cursor_session_id: "cursor-session-1",
        workspace: "/tmp/ws",
        cost_model: "estimated_transcript_text",
        scannable: true,
        risk_level: "low",
        transcript_source: "agent_transcript",
      },
    });
    mocks.mapDailyStats.mockReturnValue([
      {
        tool_name: "cursor",
        event_type: "chat",
        model: "unknown",
        tokens_in: 12,
        tokens_out: 3,
        cost_usd: 0.1,
        occurred_at: "2026-05-20T00:00:00.000Z",
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
    expect(mocks.postEvent).toHaveBeenCalledTimes(1);
    expect(mocks.postEvent.mock.calls[0]?.[0]).toMatchObject({
      tool_name: "cursor",
      event_type: "chat",
      metadata: {
        cursor_session_id: "cursor-session-1",
        transcript_source: "agent_transcript",
        scannable: true,
      },
    });

    const state = readState(appDir, host, cursorToken);
    expect(state.sessions[cursorTranscriptTurnStateKey("cursor-session-1:1")]).toMatchObject({
      fileSize: 321,
    });
    expect(state.sessions[CURSOR_DAILY_STATS_WATERMARK_KEY]).toBeUndefined();
  });

  it("preserves both Claude and Cursor checkpoints when both tools share one token", async () => {
    const sharedToken = "db90_shared_token";
    mocks.findTranscriptFiles.mockReturnValue(["/tmp/session.jsonl"]);
    mocks.parseTranscriptFile.mockResolvedValue(
      [
        {
          sessionId: "sess-1",
          turnId: "sess-1:1",
          filePath: "/tmp/session.jsonl",
          fileSize: 123,
          model: "claude-sonnet-4",
          tokensIn: 10,
          tokensOut: 5,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          occurredAt: "2026-05-19T11:00:00.000Z",
          promptText: "What changed in the release gate?",
          assistantText: "The release gate now checks package contents.",
          riskLevel: "low",
          riskScore: 0,
          riskCategories: [],
        },
      ]
    );
    mocks.mapClaudeTranscriptTurn.mockReturnValue({
      tool_name: "claude_code",
      event_type: "chat",
      model: "claude-sonnet-4",
      tokens_in: 10,
      tokens_out: 5,
      tokens_total: 15,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T11:00:00.000Z",
      metadata: {
        session_id: "sess-1:1",
        claude_session_id: "sess-1",
        transcript_source: "claude_jsonl",
        model: "claude-sonnet-4",
        base_input_tokens: 10,
        output_tokens: 5,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        risk_level: "low",
        risk_categories: [],
        risk_score: 0,
        prompt_text: "What changed in the release gate?",
        assistant_text: "The release gate now checks package contents.",
        scannable: true,
      },
    });
    mocks.readCursorEvents.mockReturnValue([{ row: { requestId: "r1" }, workspacePath: "/tmp/ws" }]);
    mocks.readCursorTranscriptSessions.mockResolvedValue([]);
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
    expect(state.sessions[sessionStateKey("sess-1:1")]).toBeDefined();
    expect(state.sessions[CURSOR_EVENTS_WATERMARK_KEY]?.sentAt).toBe("2026-05-19T12:00:00.000Z");
  });

  it("posts recent-commit snapshots and advances the recent-commit watermark", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readRecentCommitSnapshots.mockReturnValue([
      {
        dbPath: "/tmp/state.vscdb",
        value: {
          timestamp: 1716215400000,
          commitHash: "deadbeef",
          linesAdded: 8,
          linesDeleted: 2,
        },
      },
    ]);
    mocks.mapRecentCommit.mockReturnValue({
      tool_name: "cursor",
      event_type: "commit",
      model: "unknown",
      tokens_in: 8,
      tokens_out: 2,
      cost_usd: 0.1,
      occurred_at: "2026-05-20T14:30:00.000Z",
      metadata: {
        cursor_session_id: null,
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
        source: "recent_commit",
        commit_hash: "deadbeef",
      },
    });

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
    expect(mocks.mapRecentCommit).toHaveBeenCalled();
    const state = readState(appDir, host, cursorToken);
    expect(state.sessions[CURSOR_RECENT_COMMIT_WATERMARK_KEY]?.sentAt).toBe(
      "2026-05-20T14:30:00.000Z"
    );
    expect(state.lastRecentCommitHashes).toEqual(["deadbeef"]);
    expect(mocks.readRecentCommitSnapshots.mock.calls[0]?.[0]).toBeNull();
  });

  it("reads recent commits with since=null when hash dedupe is enabled", async () => {
    const cursorToken = "db90_cursor_token";
    writeState(
      {
        version: 1,
        sessions: {
          [CURSOR_RECENT_COMMIT_WATERMARK_KEY]: {
            fileSize: 0,
            sentAt: "2026-05-19T12:00:00.000Z",
          },
        },
      },
      appDir,
      host,
      cursorToken
    );

    await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(mocks.readRecentCommitSnapshots.mock.calls[0]?.[0]).toBeNull();
  });

  it("skips recent commit when lastRecentCommitHashes already contains the hash", async () => {
    const cursorToken = "db90_cursor_token";
    writeState(
      {
        version: 1,
        sessions: {
          [CURSOR_RECENT_COMMIT_WATERMARK_KEY]: {
            fileSize: 0,
            sentAt: "2026-05-19T12:00:00.000Z",
          },
        },
        lastRecentCommitHashes: ["deadbeef"],
      },
      appDir,
      host,
      cursorToken
    );
    mocks.readRecentCommitSnapshots.mockReturnValue([
      {
        dbPath: "/tmp/state.vscdb",
        value: {
          timestamp: 1716215400000,
          commitHash: "deadbeef",
          linesAdded: 8,
          linesDeleted: 2,
        },
      },
    ]);
    mocks.mapRecentCommit.mockReturnValue({
      tool_name: "cursor",
      event_type: "commit",
      model: "unknown",
      tokens_in: 8,
      tokens_out: 2,
      cost_usd: 0.1,
      occurred_at: "2026-05-20T14:30:00.000Z",
      metadata: {
        cursor_session_id: null,
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
        source: "recent_commit",
        commit_hash: "deadbeef",
      },
    });

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(mocks.readRecentCommitSnapshots.mock.calls[0]?.[0]).toBeNull();
    expect(mocks.postEvent).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it("fullScan ignores watermarks and commit hash dedupe", async () => {
    const cursorToken = "db90_cursor_token";
    writeState(
      {
        version: 1,
        sessions: {
          [CURSOR_EVENTS_WATERMARK_KEY]: {
            fileSize: 0,
            sentAt: "2026-05-19T12:00:00.000Z",
          },
          [CURSOR_RECENT_COMMIT_WATERMARK_KEY]: {
            fileSize: 0,
            sentAt: "2026-05-19T12:00:00.000Z",
          },
        },
        lastRecentCommitHashes: ["deadbeef"],
      },
      appDir,
      host,
      cursorToken
    );
    mocks.readRecentCommitSnapshots.mockReturnValue([
      {
        dbPath: "/tmp/state.vscdb",
        value: {
          timestamp: 1716215400000,
          commitHash: "deadbeef",
          linesAdded: 8,
          linesDeleted: 2,
        },
      },
    ]);
    mocks.mapRecentCommit.mockReturnValue({
      tool_name: "cursor",
      event_type: "commit",
      model: "unknown",
      tokens_in: 8,
      tokens_out: 2,
      cost_usd: 0.1,
      occurred_at: "2026-05-20T14:30:00.000Z",
      metadata: {
        cursor_session_id: null,
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
        source: "recent_commit",
        commit_hash: "deadbeef",
      },
    });

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
      fullScan: true,
    });

    expect(mocks.readCursorEvents.mock.calls[0]?.[0]).toBeNull();
    expect(mocks.readRecentCommitSnapshots.mock.calls[0]?.[0]).toBeNull();
    expect(result.sent).toBe(1);
  });

  it("sets validationFailed on cursor dry-run when payload contract fails", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readCursorEvents.mockReturnValue([{ row: { requestId: "r1" }, workspacePath: "/tmp/ws" }]);
    mocks.mapCursorEvent.mockReturnValue({
      tool_name: "cursor",
      event_type: "completion",
      model: "unknown",
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0.01,
      occurred_at: "2026-05-20T00:00:00.000Z",
      metadata: {
        cursor_session_id: null,
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
      },
    });

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: true,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(result.sent).toBe(1);
    expect(result.validationFailed).toBe(true);
  });
});

describe("filterRecentCommitsByHashDedup", () => {
  it("drops payloads whose commit_hash is in the seen set", () => {
    const payloads = [
      {
        metadata: { commit_hash: "deadbeef" },
      },
      {
        metadata: { commit_hash: "cafebabe" },
      },
    ] as Parameters<typeof filterRecentCommitsByHashDedup>[0];

    const filtered = filterRecentCommitsByHashDedup(payloads, ["deadbeef"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.metadata.commit_hash).toBe("cafebabe");
  });
});
