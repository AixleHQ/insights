import { describe, expect, it } from "vitest";
import {
  formatAiPercentage,
  isRecentCommitEvent,
  parseRecentCommitFields,
} from "./recentCommitEvent";

describe("recentCommitEvent", () => {
  it("detects commit event type and recent_commit source", () => {
    expect(isRecentCommitEvent("commit", {})).toBe(true);
    expect(isRecentCommitEvent("chat", { source: "recent_commit" })).toBe(true);
    expect(isRecentCommitEvent("chat", {})).toBe(false);
  });

  it("parses commit metadata fields", () => {
    const fields = parseRecentCommitFields(
      {
        source: "recent_commit",
        commit_hash: "1080c8e38aa694380e5e5d14c950123e6e1a2942",
        branch_name: "feature/AIX-235-cursor-review",
        repo_name: "dualboot-partners/db90-rails",
        ai_percentage: "100.00",
        commit_message: "[AIX-235] Add hooks",
      },
      "commit"
    );
    expect(fields).toEqual({
      commitHash: "1080c8e38aa694380e5e5d14c950123e6e1a2942",
      branchName: "feature/AIX-235-cursor-review",
      repoName: "dualboot-partners/db90-rails",
      aiPercentage: 100,
      commitMessage: "[AIX-235] Add hooks",
    });
  });

  it("returns null without commit_hash", () => {
    expect(parseRecentCommitFields({ source: "recent_commit" }, "commit")).toBeNull();
  });

  it("formats AI percentage", () => {
    expect(formatAiPercentage(100)).toBe("100%");
    expect(formatAiPercentage(96.43)).toBe("96.43%");
  });
});
