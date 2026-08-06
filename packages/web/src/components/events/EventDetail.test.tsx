import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { EventDetail, type EventDetailData } from "./EventDetail";

const mockCurrentRole = vi.fn<() => string | null>(() => "owner");
const mockUseCurrentUser = vi.fn(() => ({
  data: { globalAdmin: false, super_admin: false },
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({ currentRole: mockCurrentRole() }),
}));

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
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
  input_tokens: 800,
  output_tokens: 700,
  created_at: "2026-06-10T14:30:00Z",
  user: { id: "u-1", email: "dev@example.com", name: "Dev User" },
  project: { id: "proj-1", name: "My Project" },
  metadata: { foo: "bar", count: 3 },
  event_text: {
    user_text: "Tell me about this codebase",
    assistant_text: "Sure, this is a Rails API…",
    sanitized_at: "2026-06-10T14:31:00Z",
  },
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
    mockUseCurrentUser.mockReturnValue({
      data: { globalAdmin: false, super_admin: false },
    });
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

    it("renders tokens in / tokens out using formatTokens", () => {
      renderDetail(mockEvent);
      expect(screen.getByText("Tokens In")).toBeInTheDocument();
      expect(screen.getByText("Tokens Out")).toBeInTheDocument();
      expect(screen.getByText("800")).toBeInTheDocument();
      expect(screen.getByText("700")).toBeInTheDocument();
    });

    it("renders dash for tokens when in/out are absent", () => {
      renderDetail({ ...mockEvent, input_tokens: undefined, output_tokens: undefined });
      expect(screen.getByText("Tokens In")).toBeInTheDocument();
      expect(screen.getAllByText("-").length).toBeGreaterThan(0);
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
    it("renders Prompt / Metadata tabs (no Raw)", () => {
      renderDetail(mockEvent);
      expect(screen.getByRole("tab", { name: /prompt/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /metadata/i })).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /raw/i })).not.toBeInTheDocument();
    });

    it("prompt tab shows user and assistant text", () => {
      renderDetail(mockEvent);
      expect(screen.getByText("Tell me about this codebase")).toBeInTheDocument();
      expect(screen.getByText("Sure, this is a Rails API…")).toBeInTheDocument();
    });

    it("shows 'Prompt capture not enabled' placeholder when eventText is null", () => {
      renderDetail({ ...mockEvent, event_text: null });
      expect(screen.getByText("Prompt capture not enabled")).toBeInTheDocument();
      expect(screen.queryByText("Tell me about this codebase")).not.toBeInTheDocument();
    });

    it("renders metadata as a key/value table, not JSON.stringify", async () => {
      const user = userEvent.setup();
      renderDetail(mockEvent);
      await user.click(screen.getByRole("tab", { name: /metadata/i }));
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(screen.getByText("count")).toBeInTheDocument();
      // The raw JSON blob form must be gone.
      expect(screen.queryByText(/"foo":/)).not.toBeInTheDocument();
    });

    it("shows 'No metadata available' when metadata is empty", async () => {
      const user = userEvent.setup();
      renderDetail({ ...mockEvent, metadata: {} });
      await user.click(screen.getByRole("tab", { name: /metadata/i }));
      expect(screen.getByText("No metadata available")).toBeInTheDocument();
    });
  });

  describe("XSS safety", () => {
    it("renders HTML/script in prompt text as literal text, not live DOM", () => {
      const payload = '<script>alert("xss")</script><img onerror="x" />';
      const { container } = renderDetail({
        ...mockEvent,
        event_text: {
          user_text: payload,
          assistant_text: null,
          sanitized_at: null,
        },
      });
      // Literal text is present…
      expect(screen.getByText(payload)).toBeInTheDocument();
      // …and no live <script>/<img> element was injected.
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
    });
  });

  describe("access gate for non-owners", () => {
    const gateMessage = "Prompt content is visible to organization owners only.";

    it("member sees gate, not tabs", () => {
      mockCurrentRole.mockReturnValue("member");
      renderDetail(mockEvent);
      expect(screen.getByText(gateMessage)).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /prompt/i })).not.toBeInTheDocument();
    });

    it("admin sees gate, not tabs (owner-only alignment)", () => {
      mockCurrentRole.mockReturnValue("admin");
      renderDetail(mockEvent);
      expect(screen.getByText(gateMessage)).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /prompt/i })).not.toBeInTheDocument();
    });

    it("global admin sees prompt tabs even with member role", () => {
      mockCurrentRole.mockReturnValue("member");
      mockUseCurrentUser.mockReturnValue({
        data: { globalAdmin: true, super_admin: false },
      });
      renderDetail(mockEvent);
      expect(screen.getByRole("tab", { name: /prompt/i })).toBeInTheDocument();
      expect(screen.queryByText(gateMessage)).not.toBeInTheDocument();
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

    it("non-owner does not see prompt text", () => {
      mockCurrentRole.mockReturnValue("member");
      renderDetail(mockEvent);
      expect(screen.queryByText("Tell me about this codebase")).not.toBeInTheDocument();
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
        metadata: null,
      });
      expect(screen.queryByRole("tab", { name: /sanitized/i })).not.toBeInTheDocument();
      expect(screen.getByText(/has no prompt text/i)).toBeInTheDocument();
    });

    it("chat event with no captured text shows a clear placeholder, not blank", () => {
      renderDetail({
        ...mockEvent,
        event_type: "chat",
        event_text: null,
      });
      expect(screen.getByRole("tab", { name: /prompt/i })).toBeInTheDocument();
      expect(screen.getByText("Prompt capture not enabled")).toBeInTheDocument();
      expect(screen.queryByText("No content available")).not.toBeInTheDocument();
    });
  });
});
