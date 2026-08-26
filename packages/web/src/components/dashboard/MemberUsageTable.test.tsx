import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { MemberUsageTable } from "./MemberUsageTable";

const TOOL_ROWS = [
  {
    tool_name: "github_copilot",
    event_count: 669,
    tokens_in: 126_800,
    tokens_out: 152_200,
    cost_usd: 2.28,
  },
];

const MODEL_ROWS = [
  {
    model: "claude-3-5-sonnet",
    event_count: 213,
    tokens_in: 600_800,
    tokens_out: 255_200,
    cost_usd: 12.11,
  },
];

describe("MemberUsageTable", () => {
  it("renders tool usage rows by default", () => {
    render(
      <MemberUsageTable toolBreakdown={TOOL_ROWS} modelBreakdown={MODEL_ROWS} />
    );

    expect(screen.getByText("GitHub Copilot")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /github_copilot logo/i })).toBeInTheDocument();
    expect(screen.getByText("669")).toBeInTheDocument();
  });

  it("switches to model usage rows", async () => {
    const user = userEvent.setup();
    render(
      <MemberUsageTable toolBreakdown={TOOL_ROWS} modelBreakdown={MODEL_ROWS} />
    );

    await user.click(screen.getByRole("tab", { name: "Model" }));

    expect(screen.getByText("claude-3-5-sonnet")).toBeInTheDocument();
  });

  it("shows empty state when no tool data", () => {
    render(<MemberUsageTable toolBreakdown={[]} modelBreakdown={[]} />);

    expect(screen.getByText(/No tool usage data/i)).toBeInTheDocument();
  });
});
