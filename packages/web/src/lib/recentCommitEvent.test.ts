import { describe, expect, it } from "vitest";
import {
  formatAiPercentage,
  isCursorCommitEvent,
  parseRecentCommitFields,
} from "./recentCommitEvent";

describe("isCursorCommitEvent", () => {
  it("returns true for cursor commit events", () => {
    expect(isCursorCommitEvent("cursor", "commit", {})).toBe(true);
  });

  it("returns true when metadata.source is recent_commit regardless of tool_name", () => {
    expect(isCursorCommitEvent("cursor", "chat", { source: "recent_commit" })).toBe(true);
    expect(isCursorCommitEvent(null, "chat", { source: "recent_commit" })).toBe(true);
  });

  it("returns false for claude_code commit events", () => {
    expect(isCursorCommitEvent("claude_code", "commit", {})).toBe(false);
  });

  it("returns false for non-commit events", () => {
    expect(isCursorCommitEvent("cursor", "chat", {})).toBe(false);
    expect(isCursorCommitEvent(null, "chat", {})).toBe(false);
  });
});

describe("parseRecentCommitFields", () => {
  it("parses Cursor commit metadata fields", () => {
    const fields = parseRecentCommitFields(
      {
        source: "recent_commit",
        commit_hash: "1080c8e38aa694380e5e5d14c950123e6e1a2942",
        branch_name: "feature/AIX-235-cursor-review",
        repo_name: "AixleHQ/insights",
        ai_percentage: "100.00",
        commit_message: "[AIX-235] Add hooks",
      },
      "commit",
      "cursor"
    );
    expect(fields).toEqual({
      commitHash: "1080c8e38aa694380e5e5d14c950123e6e1a2942",
      branchName: "feature/AIX-235-cursor-review",
      repoName: "AixleHQ/insights",
      aiPercentage: 100,
      commitMessage: "[AIX-235] Add hooks",
      source: "cursor",
    });
  });

  it("returns null for claude_code commit events (no commit_hash)", () => {
    expect(
      parseRecentCommitFields(
        { tool_name_inner: "Bash", summary: "Bash: git commit -m fix" },
        "commit",
        "claude_code"
      )
    ).toBeNull();
  });

  it("returns null without commit_hash even for cursor tool", () => {
    expect(parseRecentCommitFields({ source: "recent_commit" }, "commit", "cursor")).toBeNull();
  });

  it("returns null for non-commit events", () => {
    expect(parseRecentCommitFields({}, "chat", "cursor")).toBeNull();
  });
});

describe("formatAiPercentage", () => {
  it("formats percentages correctly", () => {
    expect(formatAiPercentage(100)).toBe("100%");
    expect(formatAiPercentage(96.43)).toBe("96.43%");
  });
});
