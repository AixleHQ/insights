import { describe, expect, it } from "vitest";
import { mapDailyStats, mapEvent, mapRecentCommit } from "../mapper.js";
import { validateCursorPayload } from "../payload-contract.js";
import type { CursorRow } from "../mapper.js";
import type { DailyStatsEntry, RecentCommitSnapshot } from "../cursor-reader.js";

const dbPath = "/tmp/workspace/state.vscdb";

/**
 * CUR-V02: fixture matrix — each Cursor ingest path maps to a contract-valid payload.
 * Live machine verification: `npm run verify:dry-run-matrix` in db90-cursor.
 */
describe("dry-run matrix (fixture paths)", () => {
  it("Path A — daily tab (completion)", () => {
    const entry: DailyStatsEntry = {
      date: "2026-05-20",
      dbPath,
      value: {
        tabSuggestedLines: 412,
        tabAcceptedLines: 73,
        composerSuggestedLines: 0,
        composerAcceptedLines: 0,
      },
    };
    const payloads = mapDailyStats(entry);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].event_type).toBe("completion");
    expect(validateCursorPayload(payloads[0]).ok).toBe(true);
    expect(validateCursorPayload(payloads[0]).path).toBe("daily_tab");
    expect(payloads[0].metadata.cost_model).toBe("estimated_line_count");
  });

  it("Path A — daily composer (chat)", () => {
    const entry: DailyStatsEntry = {
      date: "2026-05-20",
      dbPath,
      value: {
        tabSuggestedLines: 0,
        tabAcceptedLines: 0,
        composerSuggestedLines: 188,
        composerAcceptedLines: 142,
      },
    };
    const payloads = mapDailyStats(entry);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].event_type).toBe("chat");
    expect(validateCursorPayload(payloads[0]).ok).toBe(true);
    expect(validateCursorPayload(payloads[0]).path).toBe("daily_composer");
  });

  it("Path B — recent commit", () => {
    const snapshot: RecentCommitSnapshot = {
      dbPath,
      value: {
        timestamp: 1716215400000,
        commitHash: "abc123def456",
        commitMessage: "Refactor pricing validation",
        repoName: "acme/demo",
        branchName: "feature/example",
        linesAdded: 84,
        linesDeleted: 31,
        tabLinesAdded: 12,
        composerLinesAdded: 65,
        aiPercentage: 78.5,
      },
    };
    const payload = mapRecentCommit(snapshot);
    expect(payload).not.toBeNull();
    expect(payload!.event_type).toBe("commit");
    expect(validateCursorPayload(payload!).ok).toBe(true);
    expect(validateCursorPayload(payload!).path).toBe("recent_commit");
    expect(payload!.metadata.source).toBe("recent_commit");
    expect(payload!.metadata.cost_model).toBe("estimated_line_count");
  });

  it("Path C — legacy per-request row", () => {
    const row: CursorRow = {
      requestId: "req-legacy-1",
      timestamp: 1716195612345,
      model: "claude-3-5-sonnet",
      promptTokens: 5000,
      generatedTokens: 1200,
      type: 1,
      sessionId: "session-uuid",
    };
    const payload = mapEvent(row, "/tmp/ws/hash");
    expect(payload).not.toBeNull();
    expect(validateCursorPayload(payload!).ok).toBe(true);
    expect(validateCursorPayload(payload!).path).toBe("legacy_request");
    expect(payload!.metadata.cursor_session_id).toBe("session-uuid");
  });
});
