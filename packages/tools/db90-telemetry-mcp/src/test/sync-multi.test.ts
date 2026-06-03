import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRICING } from "../pricing.js";
import { readState, writeState } from "../state.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

const mocks = vi.hoisted(() => ({
  findTranscriptFiles: vi.fn(),
  parseTranscriptFile: vi.fn(),
  mapClaudeTranscriptTurn: vi.fn(),
  lookupProjectByRemote: vi.fn(),
  enrichCommitProjectAttribution: vi.fn(),
  readCursorEvents: vi.fn(),
  readDailyStats: vi.fn(),
  readRecentCommitSnapshots: vi.fn(),
  readCursorTranscriptSessions: vi.fn(),
  mapCursorEvent: vi.fn(),
  mapCursorTranscriptTurn: vi.fn(),
  mapDailyStats: vi.fn(),
  mapRecentCommit: vi.fn(),
  readCursorActiveModel: vi.fn(),
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
  HOOK_COST_MODEL: "cursor_hook",
}));

vi.mock("../cursor-settings.js", () => ({
  readCursorActiveModel: mocks.readCursorActiveModel,
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

vi.mock("@db90/sdk", () => ({
  enrichCommitProjectAttribution: mocks.enrichCommitProjectAttribution,
  lookupProjectByRemote: mocks.lookupProjectByRemote,
  canonicalizeGitRemote: (remote: string) => remote,
  getGitRemoteForPath: (repoPath: string) => {
    try {
      const out = (execFileSync as ReturnType<typeof vi.fn>)(
        "git", ["-C", repoPath, "remote", "get-url", "origin"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }
      ) as string;
      return out?.trim() || null;
    } catch {
      return null;
    }
  },
  loadBaseConfig: () => ({ pricing: {} }),
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
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });
    mocks.findTranscriptFiles.mockReturnValue([]);
    mocks.parseTranscriptFile.mockResolvedValue([]);
    mocks.mapClaudeTranscriptTurn.mockReturnValue(null);
    mocks.lookupProjectByRemote.mockResolvedValue("not-found");
    mocks.enrichCommitProjectAttribution.mockResolvedValue(undefined);
    mocks.readCursorEvents.mockReturnValue([]);
    mocks.readDailyStats.mockReturnValue({ raw: [], deduped: [] });
    mocks.readRecentCommitSnapshots.mockReturnValue([]);
    mocks.readCursorTranscriptSessions.mockResolvedValue([]);
    mocks.mapCursorEvent.mockReturnValue(null);
    mocks.mapCursorTranscriptTurn.mockReturnValue(null);
    mocks.mapDailyStats.mockReturnValue([]);
    mocks.mapRecentCommit.mockReturnValue(null);
    mocks.readCursorActiveModel.mockReturnValue(null);
    mocks.postEvent.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DB90_MCP_HOME;
    resetBackoffStateForTests();
  });

  it("processes cursor hook queue events during cursor sync", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(
      queuePath,
      JSON.stringify({
        captured_at: "2026-05-27T00:01:00.000Z",
        hook_event_name: "sessionEnd",
        conversation_id: "cmp-sync",
        generation_id: "gen-sync",
        model: "claude-sonnet-4-20250514",
        workspace_roots: ["/tmp/sync-repo"],
        cursor_version: "1.7.4",
      }) + "\n",
      "utf-8"
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
    expect(result.failed).toBe(0);
    expect(mocks.postEvent).toHaveBeenCalledTimes(1);
    expect(mocks.postEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: "cursor",
        event_type: "chat",
        model: "claude-sonnet-4-20250514",
        metadata: expect.objectContaining({
          cost_model: "cursor_hook",
          ingest_source: "cursor_hook",
          session_id: "cursor:hook:cmp-sync:gen-sync:sessionEnd",
        }),
      }),
      host,
      "db90_cursor_token",
      expect.any(Object)
    );
    expect(readFileSync(queuePath, "utf-8").trim()).toBe("");

    const state = readState(appDir, host, "db90_cursor_token");
    expect(state.sessions["cursor:hook:cmp-sync:gen-sync:sessionEnd"]).toBeDefined();
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

  it("passes active model from settings into daily stats and commit mappers", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readCursorActiveModel.mockReturnValue("claude-4-sonnet");
    mocks.readDailyStats.mockReturnValue({
      raw: [
        {
          date: "2026-05-20",
          value: { tabSuggestedLines: 5, tabAcceptedLines: 2 },
          dbPath: "/tmp/state.vscdb",
        },
      ],
      deduped: [
        {
          date: "2026-05-20",
          value: { tabSuggestedLines: 5, tabAcceptedLines: 2 },
          dbPath: "/tmp/state.vscdb",
        },
      ],
    });
    mocks.mapDailyStats.mockReturnValue([
      {
        tool_name: "cursor",
        event_type: "completion",
        model: "claude-4-sonnet",
        tokens_in: 5,
        tokens_out: 2,
        cost_usd: 0.1,
        occurred_at: "2026-05-20T00:00:00.000Z",
        metadata: {
          cursor_session_id: null,
          workspace: "/tmp/state.vscdb",
          cost_model: "estimated_line_count",
          scannable: false,
          risk_level: "none",
        },
      },
    ]);
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
      model: "claude-4-sonnet",
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

    await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(mocks.readCursorActiveModel).toHaveBeenCalledTimes(1);
    expect(mocks.mapDailyStats).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.anything(),
      "claude-4-sonnet"
    );
    expect(mocks.mapRecentCommit).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.anything(),
      "claude-4-sonnet"
    );
  });

  it("overrides Claude auto-detected cwd project instead of reusing the sync cwd project", async () => {
    const sharedToken = "db90_shared_token";
    mocks.findTranscriptFiles.mockReturnValue(["/tmp/session.jsonl"]);
    mocks.parseTranscriptFile.mockResolvedValue([
      {
        sessionId: "sess-claude",
        turnId: "sess-claude:1",
        filePath: "/tmp/session.jsonl",
        fileSize: 123,
        cwd: "/repos/right-project",
        model: "claude-sonnet-4",
        tokensIn: 10,
        tokensOut: 5,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        occurredAt: "2026-05-19T11:00:00.000Z",
        promptText: "Check project attribution",
        assistantText: "Using the repo-specific cwd.",
        riskLevel: "low",
        riskScore: 0,
        riskCategories: [],
      },
    ]);
    mockExecFileSync.mockReturnValue("git@github.com:org/right-project.git\n" as unknown as Buffer);
    mocks.lookupProjectByRemote.mockResolvedValue({ project_id: "proj-from-cwd", name: "Right Project" });
    mocks.mapClaudeTranscriptTurn.mockImplementation((_turn, options) => ({
      tool_name: "claude_code",
      event_type: "chat",
      model: "claude-sonnet-4",
      tokens_in: 10,
      tokens_out: 5,
      tokens_total: 15,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T11:00:00.000Z",
      project_id: options?.projectId ?? undefined,
      metadata: {
        session_id: "sess-claude:1",
        claude_session_id: "sess-claude",
        transcript_source: "claude_jsonl",
        model: "claude-sonnet-4",
        base_input_tokens: 10,
        output_tokens: 5,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        risk_level: "low",
        risk_categories: [],
        risk_score: 0,
        prompt_text: "Check project attribution",
        assistant_text: "Using the repo-specific cwd.",
        scannable: true,
      },
    }));

    await syncTelemetryTools({
      credentials: { host, accounts: { claude_code: sharedToken } },
      dryRun: false,
      verbose: false,
      projectId: "wrong-sync-cwd-project",
      projectIdSource: "auto-detect",
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["claude_code"],
    });

    expect(mocks.mapClaudeTranscriptTurn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repos/right-project" }),
      expect.objectContaining({ projectId: "proj-from-cwd" })
    );
  });

  it("overrides Cursor workspace payloads with workspace-specific project attribution", async () => {
    const cursorToken = "db90_cursor_token";
    mocks.readCursorEvents.mockReturnValue([
      { row: { requestId: "r1" }, workspacePath: "/tmp/storage/workspace-a" },
    ]);
    mocks.mapCursorEvent.mockReturnValue({
      tool_name: "cursor",
      event_type: "chat",
      model: "gpt-4.1",
      tokens_in: 3,
      tokens_out: 1,
      cost_usd: 0.1,
      occurred_at: "2026-05-19T09:00:00.000Z",
      project_id: "wrong-sync-cwd-project",
      metadata: {
        cursor_session_id: "r1",
        workspace: "/tmp/storage/workspace-a",
        workspace_folder: "/repos/right-project",
        cost_model: "estimated_line_count",
        scannable: false,
        risk_level: "none",
      },
    });
    mockExecFileSync.mockReturnValue("git@github.com:org/right-project.git\n" as unknown as Buffer);
    mocks.lookupProjectByRemote.mockResolvedValue({ project_id: "proj-from-workspace", name: "Right Project" });

    await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: "wrong-sync-cwd-project",
      projectIdSource: "auto-detect",
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(mocks.postEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj-from-workspace",
        metadata: expect.objectContaining({ workspace_folder: "/repos/right-project" }),
      }),
      host,
      cursorToken,
      expect.any(Object)
    );
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

  it("scopeDir: only syncs Claude turns whose cwd matches and uses pre-resolved projectId", async () => {
    const token = "db90_scoped_token";
    mocks.findTranscriptFiles.mockReturnValue(["/transcripts/a.jsonl"]);
    mocks.parseTranscriptFile.mockResolvedValueOnce([
      {
        sessionId: "sess-a",
        turnId: "sess-a:1",
        filePath: "/transcripts/a.jsonl",
        fileSize: 100,
        cwd: "/repos/test-repo",
        model: "claude-sonnet-4",
        tokensIn: 10,
        tokensOut: 5,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        occurredAt: "2026-05-19T10:00:00.000Z",
        promptText: "in scope",
        assistantText: "yes",
        riskLevel: "low",
        riskScore: 0,
        riskCategories: [],
      },
      {
        sessionId: "sess-b",
        turnId: "sess-b:1",
        filePath: "/transcripts/a.jsonl",
        fileSize: 100,
        cwd: "/repos/db90-rails",
        model: "claude-sonnet-4",
        tokensIn: 8,
        tokensOut: 3,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        occurredAt: "2026-05-19T10:01:00.000Z",
        promptText: "out of scope",
        assistantText: "no",
        riskLevel: "low",
        riskScore: 0,
        riskCategories: [],
      },
    ]);
    mocks.mapClaudeTranscriptTurn.mockImplementation((_turn, options) => ({
      tool_name: "claude_code",
      event_type: "chat",
      occurred_at: "2026-05-19T10:00:00.000Z",
      cost_usd: null,
      project_id: options?.projectId ?? undefined,
      metadata: {
        session_id: _turn.turnId,
        claude_session_id: _turn.sessionId,
        transcript_source: "claude_jsonl",
        model: null,
        base_input_tokens: 0,
        output_tokens: 0,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        risk_level: "low",
        risk_categories: [],
        risk_score: 0,
        scannable: true as const,
      },
    }));

    await syncTelemetryTools({
      credentials: { host, accounts: { claude_code: token } },
      dryRun: false,
      verbose: false,
      projectId: "scoped-project-id",
      projectIdSource: "auto-detect",
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["claude_code"],
      scopeDir: "/repos/test-repo",
    });

    expect(mocks.postEvent).toHaveBeenCalledTimes(1);
    expect(mocks.postEvent).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "scoped-project-id" }),
      host,
      token,
      expect.any(Object)
    );
    expect(mockExecFileSync).not.toHaveBeenCalled();
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

  it("passes through payloads with undefined commit_hash even when seen set contains empty string", () => {
    const payloads = [
      { metadata: {} },
      { metadata: { commit_hash: "cafebabe" } },
    ] as Parameters<typeof filterRecentCommitsByHashDedup>[0];

    // "" in the seen set must not match a payload with no commit_hash
    const filtered = filterRecentCommitsByHashDedup(payloads, ["", "deadbeef"]);
    expect(filtered).toHaveLength(2);
    expect(filtered[1]?.metadata.commit_hash).toBe("cafebabe");
  });

  it("passes all payloads through when seen list is empty", () => {
    const payloads = [
      { metadata: { commit_hash: "abc" } },
    ] as Parameters<typeof filterRecentCommitsByHashDedup>[0];

    expect(filterRecentCommitsByHashDedup(payloads, [])).toHaveLength(1);
    expect(filterRecentCommitsByHashDedup(payloads, undefined)).toHaveLength(1);
  });
});

describe("lastRecentCommitHashes partial batch failure guard", () => {
  let appDir: string;
  const host = "http://localhost:3000";
  const cursorToken = "db90_cursor_token";

  function makeCommitPayload(hash: string, occurredAt: string) {
    return {
      tool_name: "cursor" as const,
      event_type: "commit" as const,
      model: "unknown",
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0.01,
      occurred_at: occurredAt,
      metadata: {
        cursor_session_id: null,
        workspace: "/tmp/state.vscdb",
        cost_model: "estimated_line_count" as const,
        scannable: false as const,
        risk_level: "none" as const,
        source: "recent_commit",
        commit_hash: hash,
      },
    };
  }

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), "db90-mcp-partial-"));
    process.env.DB90_MCP_HOME = appDir;
    mkdirSync(appDir, { recursive: true });
    vi.clearAllMocks();
    mockExecFileSync.mockImplementation(() => { throw new Error("not a git repo"); });
    mocks.findTranscriptFiles.mockReturnValue([]);
    mocks.parseTranscriptFile.mockResolvedValue([]);
    mocks.mapClaudeTranscriptTurn.mockReturnValue(null);
    mocks.lookupProjectByRemote.mockResolvedValue("not-found");
    mocks.enrichCommitProjectAttribution.mockResolvedValue(undefined);
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

  it("does not persist lastRecentCommitHashes when batch partially fails", async () => {
    mocks.readRecentCommitSnapshots.mockReturnValue([
      { dbPath: "/tmp/state.vscdb", value: { timestamp: 1716215400000, commitHash: "aaa", linesAdded: 1, linesDeleted: 0 } },
      { dbPath: "/tmp/state.vscdb", value: { timestamp: 1716215401000, commitHash: "bbb", linesAdded: 1, linesDeleted: 0 } },
    ]);
    mocks.mapRecentCommit
      .mockReturnValueOnce(makeCommitPayload("aaa", "2026-05-20T14:30:00.000Z"))
      .mockReturnValueOnce(makeCommitPayload("bbb", "2026-05-20T14:31:00.000Z"));

    // First commit succeeds, second fails — partial batch
    mocks.postEvent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

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
    expect(result.failed).toBe(1);

    const state = readState(appDir, host, cursorToken);
    // Hashes must NOT be persisted — the failed commit (bbb) must remain retryable
    expect(state.lastRecentCommitHashes).toBeUndefined();
  });

  it("persists lastRecentCommitHashes only when the entire batch succeeds", async () => {
    mocks.readRecentCommitSnapshots.mockReturnValue([
      { dbPath: "/tmp/state.vscdb", value: { timestamp: 1716215400000, commitHash: "aaa", linesAdded: 1, linesDeleted: 0 } },
      { dbPath: "/tmp/state.vscdb", value: { timestamp: 1716215401000, commitHash: "bbb", linesAdded: 1, linesDeleted: 0 } },
    ]);
    mocks.mapRecentCommit
      .mockReturnValueOnce(makeCommitPayload("aaa", "2026-05-20T14:30:00.000Z"))
      .mockReturnValueOnce(makeCommitPayload("bbb", "2026-05-20T14:31:00.000Z"));

    mocks.postEvent.mockResolvedValue(true);

    const result = await syncTelemetryTools({
      credentials: { host, accounts: { cursor: cursorToken } },
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      tools: ["cursor"],
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);

    const state = readState(appDir, host, cursorToken);
    expect(state.lastRecentCommitHashes).toEqual(["aaa", "bbb"]);
  });
});
