import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventDrawer } from "./EventDrawer";
import type { ToolEvent } from "@/lib/types";

const mockCurrentOrg = { id: "org-1", role: "owner" };

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({ currentOrg: mockCurrentOrg, currentRole: () => "owner" }),
}));

vi.mock("@/components/ui/risk-badge", () => ({
  RiskBadge: ({ level }: { level: string }) => (
    <span data-testid="risk-badge">{level}</span>
  ),
}));

vi.mock("@/lib/riskLevel", () => ({
  normalizeRiskLevel: (v: string | null | undefined) => v ?? "none",
}));

vi.mock("./RecentCommitDetail", () => ({
  RecentCommitDetail: () => <div data-testid="recent-commit-detail" />,
}));

vi.mock("@/lib/recentCommitEvent", () => ({
  parseRecentCommitFields: () => null,
}));

const mockUseEvent = vi.fn();
vi.mock("@/hooks/useApi", () => ({
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
}));

const baseEvent: ToolEvent = {
  id: "evt-1",
  toolName: "claude_code",
  eventType: "prompt_sent",
  attribution: "direct",
  riskLevel: "low",
  costUsd: 0.0042,
  inputTokens: 400,
  outputTokens: 300,
  model: "claude-opus-4",
  securityFindings: [],
  user: { id: "u-1", email: "dev@example.com", name: "Dev User" },
  project: { id: "proj-1", name: "My Project" },
  createdAt: "2026-06-10T14:30:00Z",
  occurredAt: "2026-06-10T14:30:00Z",
};

function renderDrawer(event: Partial<ToolEvent> = {}) {
  mockUseEvent.mockReturnValue({ data: { ...baseEvent, ...event }, isLoading: false });
  return render(
    <MemoryRouter>
      <EventDrawer eventId="evt-1" open onOpenChange={vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockUseEvent.mockReset();
});

describe("EventDrawer token display", () => {
  it("shows Tokens In and Tokens Out as separate rows", () => {
    renderDrawer({ inputTokens: 400, outputTokens: 300 });
    expect(screen.getByText("Tokens In")).toBeInTheDocument();
    expect(screen.getByText("Tokens Out")).toBeInTheDocument();
  });

  it("does not show a combined Tokens row", () => {
    renderDrawer({ inputTokens: 400, outputTokens: 300 });
    expect(screen.queryByText(/^Tokens$/)).not.toBeInTheDocument();
  });

  it("formats Tokens In with formatTokens", () => {
    renderDrawer({ inputTokens: 1500, outputTokens: 500 });
    expect(screen.getByText("1.5K")).toBeInTheDocument();
  });

  it("formats Tokens Out with formatTokens", () => {
    renderDrawer({ inputTokens: 100, outputTokens: 2000 });
    expect(screen.getByText("2.0K")).toBeInTheDocument();
  });

  it("shows dash when inputTokens is null", () => {
    renderDrawer({ inputTokens: null, outputTokens: 300 });
    const rows = screen.getAllByText("-");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shows dash when outputTokens is null", () => {
    renderDrawer({ inputTokens: 400, outputTokens: null });
    const rows = screen.getAllByText("-");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
