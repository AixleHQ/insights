import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRICING } from "../pricing.js";
import { readState } from "../state.js";

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
  postEvent: vi.fn(),
}));

vi.mock("../readers/claude.js", () => ({
  findTranscriptFiles: mocks.findTranscriptFiles,
  parseTranscriptFile: mocks.parseTranscriptFile,
  mapTranscriptTurn: mocks.mapClaudeTranscriptTurn,
}));

vi.mock("../readers/cursor.js", () => ({
  readEvents: mocks.readCursorEvents,
  readDailyStats: mocks.readDailyStats,
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
}));

vi.mock("@db90/sdk", () => ({
  enrichCommitProjectAttribution: mocks.enrichCommitProjectAttribution,
  lookupProjectByRemote: mocks.lookupProjectByRemote,
  canonicalizeGitRemote: (remote: string) => remote,
}));

import {
  CURSOR_DAILY_STATS_WATERMARK_KEY,
  CURSOR_EVENTS_WATERMARK_KEY,
  CURSOR_RECENT_COMMIT_WATERMARK_KEY,
  cursorTranscriptTurnStateKey,
  sessionStateKey,
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
    mocks.readDailyStats.mockReturnValue([]);
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
    mocks.readDailyStats.mockReturnValue([
      { date: "2026-05-20", value: { composerSuggestedLines: 12, composerAcceptedLines: 3 }, dbPath: "/tmp/state.vscdb" },
    ]);
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

  it("scopeDir: only syncs Claude turns whose cwd matches and uses pre-resolved projectId", async () => {
    const token = "db90_scoped_token";
    mocks.findTranscriptFiles.mockReturnValue(["/transcripts/a.jsonl"]);
    mocks.parseTranscriptFile.mockResolvedValueOnce([
      {
        sessionId: "sess-a",
        turnId: "sess-a:1",
        filePath: "/transcripts/a.jsonl",
        fileSize: 100,
        cwd: "/repos/test-repo",         // in-scope
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
        cwd: "/repos/db90-rails",         // out-of-scope
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
      metadata: { session_id: _turn.turnId, claude_session_id: _turn.sessionId, transcript_source: "claude_jsonl", model: null, base_input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, risk_level: "low", risk_categories: [], risk_score: 0, scannable: true as const },
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

    // Only the in-scope turn was posted
    expect(mocks.postEvent).toHaveBeenCalledTimes(1);
    expect(mocks.postEvent).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "scoped-project-id" }),
      host,
      token,
      expect.any(Object)
    );
    // Per-turn git lookup should NOT have been called (scopeDir uses pre-resolved projectId)
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});
