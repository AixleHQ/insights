import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db90Payload } from "../mapper.js";

const mocks = vi.hoisted(() => ({
  readEvents: vi.fn(() => []),
  readDailyStatsWithDedupe: vi.fn(() => ({ raw: [], deduped: [] })),
  readRecentCommitSnapshots: vi.fn(),
  mapRecentCommit: vi.fn(),
}));

vi.mock("../cursor-reader.js", () => ({
  readEvents: mocks.readEvents,
  readDailyStatsWithDedupe: mocks.readDailyStatsWithDedupe,
  readRecentCommitSnapshots: mocks.readRecentCommitSnapshots,
}));

vi.mock("../mapper.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../mapper.js")>();
  return {
    ...actual,
    mapEvent: vi.fn(),
    mapDailyStats: vi.fn(() => []),
    mapRecentCommit: mocks.mapRecentCommit,
  };
});

import { collectSyncPayloads } from "../collect-payloads.js";

const commitPayload = (hash: string): Db90Payload => ({
  tool_name: "cursor",
  event_type: "commit",
  model: "unknown",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0,
  occurred_at: "2026-05-28T00:03:43.823Z",
  metadata: {
    cursor_session_id: null,
    workspace: "/tmp/state.vscdb",
    workspace_scope: "global",
    cost_model: "estimated_line_count",
    source: "recent_commit",
    commit_hash: hash,
    scannable: false,
    risk_level: "none",
  },
});

describe("collectSyncPayloads recentCommit hash dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRecentCommitSnapshots.mockReturnValue([{ dbPath: "/tmp/state.vscdb", value: {} }]);
  });

  it("ignores timestamp watermark and skips only when commit hash matches", () => {
    mocks.mapRecentCommit.mockReturnValue(commitPayload("c203edf"));

    const withoutHash = collectSyncPayloads({
      since: new Date("2026-05-28T00:03:43.823Z"),
      sinceRecentCommit: new Date("2026-05-28T00:03:43.823Z"),
      recentCommitHashDedup: true,
    });
    expect(withoutHash.payloads).toHaveLength(1);
    expect(mocks.readRecentCommitSnapshots).toHaveBeenCalledWith(null, undefined, false);

    const withHash = collectSyncPayloads({
      recentCommitHashDedup: true,
      lastRecentCommitHashes: ["c203edf"],
    });
    expect(withHash.payloads).toHaveLength(0);
  });

  it("uses sinceRecentCommit when hash dedup is disabled", () => {
    mocks.mapRecentCommit.mockReturnValue(commitPayload("deadbeef"));
    const since = new Date("2026-05-20T00:00:00.000Z");

    collectSyncPayloads({
      sinceRecentCommit: since,
      recentCommitHashDedup: false,
    });

    expect(mocks.readRecentCommitSnapshots).toHaveBeenCalledWith(since, undefined, false);
  });
});
