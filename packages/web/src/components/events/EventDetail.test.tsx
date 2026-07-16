import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { EventDetail, type EventDetailData } from "./EventDetail";

const mockCurrentRole = vi.fn<() => string | null>(() => "owner");

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({ currentRole: mockCurrentRole() }),
}));

vi.mock("@/components/ui/risk-badge", () => ({
  RiskBadge: ({ level }: { level: string }) => (
    <span data-testid="risk-badge">{level}</span>
  ),
}));

vi.mock("@/lib/riskLevel", () => ({
  normalizeRiskLevel: (value: string | null | undefined) => value ?? "none",
}));

vi.mock("./RecentCommitDetail", () => ({
  RecentCommitDetail: () => <div data-testid="recent-commit-detail" />,
}));

const mockEvent: EventDetailData = {
  id: "evt-1",
  tool_name: "claude_code",
  event_type: "prompt_sent",
  model: "claude-opus-4",
  risk_level: "high",
  cost_usd: 0.0042,
  token_count: 1500,
  created_at: "2026-06-10T14:30:00Z",
  user: { id: "u-1", email: "dev@example.com", name: "Dev User" },
  project: { id: "proj-1", name: "My Project" },
  sanitized_content: "Tell me about this codebase",
  raw_content: undefined, // not mapped by EventDetailPage
  metadata: { foo: "bar" },
  findings: [
    {
      type: "pii",
      severity: "critical",
      description: "Email address detected",
      location: "Characters 0-20",
    },
    {
      type: "secret",
      severity: "high",
      description: "API key pattern found",
    },
  ],
};

function renderDetail(event: EventDetailData | null, isLoading = false) {
  return render(
    <MemoryRouter>
      <EventDetail event={event} isLoading={isLoading} />
    </MemoryRouter>
  );
}

describe("EventDetail", () => {
  beforeEach(() => {
    mockCurrentRole.mockReturnValue("owner");
  });

  describe("loading state", () => {
    it("renders skeletons and no event data", () => {
      renderDetail(null, true);
      expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
    });
  });

  describe("not-found state", () => {
    it("renders not-found message and back link", () => {
      renderDetail(null, false);
      expect(screen.getByText("Event not found")).toBeInTheDocument();
      const backLink = screen.getByRole("link", { name: /back to events/i });
      expect(backLink).toHaveAttribute("href", "/events");
    });
  });

  describe("header", () => {
    it("renders humanized tool name", () => {
      renderDetail(mockEvent);
      expect(screen.getByRole("heading", { name: /claude code/i })).toBeInTheDocument();
    });

    it("renders risk badge", () => {
      renderDetail(mockEvent);
      expect(screen.getAllByTestId("risk-badge").length).toBeGreaterThan(0);
    });

    it("renders formatted date", () => {
      renderDetail(mockEvent);
      // created_at: "2026-06-10T14:30:00Z" → "Jun 10, 2026" in en-US dateStyle: medium
      expect(screen.getAllByText(/Jun 10, 2026/i).length).toBeGreaterThan(0);
    });

    it("back button links to /events", () => {
      renderDetail(mockEvent);
      expect(screen.getByRole("link", { name: /back to events/i })).toHaveAttribute("href", "/events");
    });
  });

  describe("details card", () => {
    it("renders cost using formatCost ($ prefix)", () => {
      renderDetail(mockEvent);
      expect(screen.getByText(/\$0\.004/)).toBeInTheDocument();
    });

    it("renders tokens using formatTokens (K suffix for 1500)", () => {
      renderDetail(mockEvent);
      expect(screen.getByText(/1\.5K/)).toBeInTheDocument();
    });

    it("renders model name when present and not 'unknown'", () => {
      renderDetail(mockEvent);
      expect(screen.getByText("claude-opus-4")).toBeInTheDocument();
    });

    it("omits model row when model is 'unknown'", () => {
      renderDetail({ ...mockEvent, model: "unknown" });
      expect(screen.queryByText("unknown")).not.toBeInTheDocument();
    });

    it("omits model row when model is absent", () => {
      renderDetail({ ...mockEvent, model: undefined });
      expect(screen.queryByText(/model/i)).not.toBeInTheDocument();
    });

    it("renders project link", () => {
      renderDetail(mockEvent);
      const projectLink = screen.getByRole("link", { name: "My Project" });
      expect(projectLink).toHaveAttribute("href", "/projects/proj-1");
    });

    it("renders 'None' when no project", () => {
      renderDetail({ ...mockEvent, project: undefined });
      expect(screen.getByText("None")).toBeInTheDocument();
    });

    it("renders user email", () => {
      renderDetail(mockEvent);
      expect(screen.getByText("dev@example.com")).toBeInTheDocument();
    });
  });

  describe("owner: content tabs", () => {
    it("renders Sanitized / Raw / Metadata tabs", () => {
      renderDetail(mockEvent);
      expect(screen.getByRole("tab", { name: /sanitized/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /raw/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /metadata/i })).toBeInTheDocument();
    });

    it("sanitized tab shows content", () => {
      renderDetail(mockEvent);
      expect(screen.getByText("Tell me about this codebase")).toBeInTheDocument();
    });

    it("raw tab shows prompt placeholder (field not mapped from API)", async () => {
      const user = userEvent.setup();
      renderDetail(mockEvent);
      await user.click(screen.getByRole("tab", { name: /raw/i }));
      expect(
        screen.getByText(/prompt capture is not enabled/i)
      ).toBeInTheDocument();
    });

    it("metadata tab shows JSON stringified output", async () => {
      const user = userEvent.setup();
      renderDetail(mockEvent);
      await user.click(screen.getByRole("tab", { name: /metadata/i }));
      expect(screen.getByText(/"foo"/)).toBeInTheDocument();
    });
  });

  describe("owner: security findings", () => {
    it("renders finding cards with severity tokens", () => {
      renderDetail(mockEvent);
      expect(screen.getByText("Email address detected")).toBeInTheDocument();
      expect(screen.getByText("API key pattern found")).toBeInTheDocument();
    });

    it("renders location when present", () => {
      renderDetail(mockEvent);
      expect(screen.getByText(/Characters 0-20/)).toBeInTheDocument();
    });

    it("omits findings section when there are no findings", () => {
      renderDetail({ ...mockEvent, findings: [] });
      expect(screen.queryByText("Security Findings")).not.toBeInTheDocument();
    });
  });

  describe("access gate for non-owners", () => {
    const gateMessage = "Prompt content is visible to organization owners only.";

    it("member sees gate, not tabs", () => {
      mockCurrentRole.mockReturnValue("member");
      renderDetail(mockEvent);
      expect(screen.getByText(gateMessage)).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /sanitized/i })).not.toBeInTheDocument();
    });

    it("admin sees gate, not tabs (AIX-115 alignment)", () => {
      mockCurrentRole.mockReturnValue("admin");
      renderDetail(mockEvent);
      expect(screen.getByText(gateMessage)).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /sanitized/i })).not.toBeInTheDocument();
    });

    it("viewer sees gate", () => {
      mockCurrentRole.mockReturnValue("viewer");
      renderDetail(mockEvent);
      expect(screen.getByText(gateMessage)).toBeInTheDocument();
    });

    it("null role sees gate", () => {
      mockCurrentRole.mockReturnValue(null);
      renderDetail(mockEvent);
      expect(screen.getByText(gateMessage)).toBeInTheDocument();
    });

    it("non-owner does not see security findings", () => {
      mockCurrentRole.mockReturnValue("member");
      renderDetail(mockEvent);
      expect(screen.queryByText("Security Findings")).not.toBeInTheDocument();
    });
  });

  describe("RecentCommit card", () => {
    it("renders RecentCommitDetail when metadata has source=recent_commit", () => {
      renderDetail({
        ...mockEvent,
        metadata: { source: "recent_commit", commit_hash: "abc1234" },
      });
      expect(screen.getByTestId("recent-commit-detail")).toBeInTheDocument();
    });

    it("does not render RecentCommitDetail for regular events", () => {
      renderDetail(mockEvent);
      expect(screen.queryByTestId("recent-commit-detail")).not.toBeInTheDocument();
    });
  });

  describe("graceful empty prompt (AIX-511)", () => {
    it("commit event renders no prompt tab, only Metadata, and no empty <pre>", () => {
      renderDetail({
        ...mockEvent,
        event_type: "commit",
        sanitized_content: undefined,
        metadata: { source: "recent_commit", commit_hash: "abc1234" },
      });
      expect(screen.getByTestId("recent-commit-detail")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /sanitized/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /raw/i })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /metadata/i })).toBeInTheDocument();
      expect(screen.queryByText("No content available")).not.toBeInTheDocument();
    });

    it("edit event (derivative, no commit metadata) shows placeholder, no prompt tabs", () => {
      renderDetail({
        ...mockEvent,
        event_type: "edit",
        sanitized_content: undefined,
        metadata: null,
      });
      expect(screen.queryByRole("tab", { name: /sanitized/i })).not.toBeInTheDocument();
      expect(screen.getByText(/has no prompt text/i)).toBeInTheDocument();
    });

    it("chat event with no captured text shows a clear placeholder, not blank", () => {
      renderDetail({
        ...mockEvent,
        event_type: "chat",
        sanitized_content: undefined,
      });
      expect(screen.getByRole("tab", { name: /sanitized/i })).toBeInTheDocument();
      expect(screen.getByText(/prompt capture is not enabled/i)).toBeInTheDocument();
      expect(screen.queryByText("No content available")).not.toBeInTheDocument();
    });
  });
});
