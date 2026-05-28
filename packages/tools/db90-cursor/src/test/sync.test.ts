import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { State } from "../state.js";

const mocks = vi.hoisted(() => ({
  readEvents: vi.fn(),
  readDailyStatsWithDedupe: vi.fn(),
  readRecentCommitSnapshots: vi.fn(),
  mapEvent: vi.fn(),
  mapDailyStats: vi.fn(),
  mapRecentCommit: vi.fn(),
  postEvents: vi.fn(),
  readState: vi.fn(),
  writeState: vi.fn(),
}));

let persistedState: State = { lastProcessedAt: null, lastRecentCommitAt: null };

vi.mock("../cursor-reader.js", () => ({
  readEvents: mocks.readEvents,
  readDailyStatsWithDedupe: mocks.readDailyStatsWithDedupe,
  readRecentCommitSnapshots: mocks.readRecentCommitSnapshots,
}));

vi.mock("../mapper.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../mapper.js")>();
  return {
    ...actual,
    mapEvent: mocks.mapEvent,
    mapDailyStats: mocks.mapDailyStats,
    mapRecentCommit: mocks.mapRecentCommit,
  };
});

vi.mock("../client.js", () => ({
  postEvents: mocks.postEvents,
}));

vi.mock("../state.js", () => ({
  readState: (_dir?: string, host?: string, _token?: string) => mocks.readState(host),
  writeState: (state: State, _dir?: string, host?: string, _token?: string) =>
    mocks.writeState(state, host),
  migrateLegacyState: vi.fn(),
  stateKey: (host: string, token: string) => `state-${host}-${token}`,
  APP_DIR: "/tmp/db90-cursor-test",
}));

const enrichMock = vi.hoisted(() => vi.fn(async (payloads: { project_id?: string }[]) => {
  for (const p of payloads) {
    if ((p as { event_type?: string }).event_type === "commit") {
      p.project_id = "proj-from-repo-name";
    }
  }
}));

vi.mock("@db90/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@db90/sdk")>();
  return {
    ...actual,
    enrichCommitProjectAttribution: enrichMock,
  };
});

import { syncOnce } from "../sync.js";

const commitPayload = {
  tool_name: "cursor" as const,
  event_type: "commit" as const,
  model: "unknown",
  tokens_in: 10,
  tokens_out: 2,
  cost_usd: 0.01,
  occurred_at: "2026-05-20T14:30:00.000Z",
  metadata: {
    cursor_session_id: null,
    workspace: "/tmp/globalStorage/state.vscdb",
    workspace_scope: "global" as const,
    cost_model: "estimated_line_count" as const,
    scannable: false as const,
    risk_level: "none" as const,
    source: "recent_commit" as const,
    commit_hash: "deadbeef",
    commit_message: "feat: telemetry",
    repo_name: "acme/demo",
    branch_name: "main",
    ai_percentage: 42,
  },
};

describe("syncOnce", () => {
  beforeEach(() => {
    persistedState = { lastProcessedAt: null, lastRecentCommitAt: null };
    vi.clearAllMocks();
    mocks.readState.mockImplementation(() => ({ ...persistedState }));
    mocks.writeState.mockImplementation((state: State) => {
      persistedState = { ...state };
    });
    mocks.readEvents.mockReturnValue([]);
    mocks.readDailyStatsWithDedupe.mockReturnValue({ raw: [], deduped: [] });
    mocks.readRecentCommitSnapshots.mockReturnValue([
      {
        dbPath: "/tmp/globalStorage/state.vscdb",
        value: {
          timestamp: 1716215400000,
          commitHash: "deadbeef",
          linesAdded: 8,
          linesDeleted: 2,
        },
      },
    ]);
    mocks.mapEvent.mockReturnValue(null);
    mocks.mapDailyStats.mockReturnValue([]);
    mocks.mapRecentCommit.mockReturnValue(commitPayload);
    mocks.postEvents.mockResolvedValue({ sent: 1, failed: 0, lastSentAt: commitPayload.occurred_at });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts recent-commit snapshots and advances lastRecentCommitAt", async () => {
    const result = await syncOnce({
      token: "test-token",
      host: "http://localhost:3000",
      dryRun: false,
      verbose: false,
      projectId: null,
    });

    expect(mocks.readRecentCommitSnapshots).toHaveBeenCalled();
    expect(mocks.mapRecentCommit).toHaveBeenCalled();
    expect(enrichMock).toHaveBeenCalled();
    expect(mocks.postEvents).toHaveBeenCalledWith(
      [expect.objectContaining({ project_id: "proj-from-repo-name" })],
      "http://localhost:3000",
      "test-token",
      expect.objectContaining({ on429: expect.any(Function) })
    );
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    expect(persistedState.lastProcessedAt).toBe("2026-05-20T14:30:00.000Z");
    expect(persistedState.lastRecentCommitAt).toBe("2026-05-20T14:30:00.000Z");
    expect(persistedState.lastRecentCommitHashes).toEqual(["deadbeef"]);
  });

  it("reads latest recentCommit on normal sync (hash dedup ignores timestamp since)", async () => {
    persistedState = {
      lastProcessedAt: "2026-05-19T00:00:00.000Z",
      lastRecentCommitAt: "2026-05-19T12:00:00.000Z",
    };
    mocks.readState.mockImplementation(() => ({ ...persistedState }));

    await syncOnce({
      token: "test-token",
      host: "http://localhost:3000",
      dryRun: false,
      verbose: false,
      projectId: null,
    });

    expect(mocks.readRecentCommitSnapshots.mock.calls[0][0]).toBeNull();
    const dailySinceArg = mocks.readDailyStatsWithDedupe.mock.calls[0][0] as Date;
    expect(dailySinceArg.toISOString()).toBe("2026-05-19T00:00:00.000Z");
  });

  it("uses explicit since for recent commits when since override is set", async () => {
    persistedState = {
      lastProcessedAt: "2026-05-19T00:00:00.000Z",
      lastRecentCommitAt: "2026-05-19T12:00:00.000Z",
    };
    mocks.readState.mockImplementation(() => ({ ...persistedState }));

    await syncOnce({
      token: "test-token",
      host: "http://localhost:3000",
      dryRun: false,
      verbose: false,
      projectId: null,
      since: new Date("2026-05-18T00:00:00.000Z"),
    });

    const sinceArg = mocks.readRecentCommitSnapshots.mock.calls[0][0] as Date;
    expect(sinceArg.toISOString()).toBe("2026-05-18T00:00:00.000Z");
  });

  it("skips recent commit when lastRecentCommitHashes already contains the hash", async () => {
    persistedState = {
      lastProcessedAt: "2026-05-19T00:00:00.000Z",
      lastRecentCommitAt: "2026-05-19T12:00:00.000Z",
      lastRecentCommitHashes: ["deadbeef"],
    };
    mocks.readState.mockImplementation(() => ({ ...persistedState }));

    const result = await syncOnce({
      token: "test-token",
      host: "http://localhost:3000",
      dryRun: false,
      verbose: false,
      projectId: null,
    });

    expect(mocks.readRecentCommitSnapshots.mock.calls[0][0]).toBeNull();
    expect(mocks.postEvents).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it("includes recent-commit payloads in dry-run output count", async () => {
    const result = await syncOnce({
      token: "test-token",
      host: "http://localhost:3000",
      dryRun: true,
      verbose: false,
      projectId: null,
    });

    expect(mocks.postEvents).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });
});
