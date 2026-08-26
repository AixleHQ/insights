import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentCommitDetail } from "./RecentCommitDetail";

describe("RecentCommitDetail", () => {
  it("renders commit_hash, branch_name, and ai_percentage", () => {
    render(
      <RecentCommitDetail
        commit={{
          commitHash: "1080c8e38aa694380e5e5d14c950123e6e1a2942",
          branchName: "feature/AIX-235-cursor-review",
          aiPercentage: 100,
          repoName: "AixleHQ/insights",
        }}
      />
    );

    expect(screen.getByTestId("recent-commit-detail")).toBeInTheDocument();
    expect(screen.getByText("Commit attribution")).toBeInTheDocument();
    expect(screen.getByText("1080c8e")).toBeInTheDocument();
    expect(screen.getByText("feature/AIX-235-cursor-review")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("AixleHQ/insights")).toBeInTheDocument();
  });
});
