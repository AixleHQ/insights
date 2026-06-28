import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventDetailPage } from "./EventDetailPage";

const mockUseEvent = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
    currentRole: "owner",
  }),
}));

vi.mock("@/components/events", () => ({
  EventDetail: ({ event, isLoading }: { event: unknown; isLoading: boolean }) => (
    <div data-testid="event-detail">
      {isLoading && <span data-testid="loading" />}
      {event ? (
        <span data-testid="event-data">{JSON.stringify(event)}</span>
      ) : (
        <span data-testid="no-event" />
      )}
    </div>
  ),
}));

const mockApiEvent = {
  id: "evt-1",
  toolName: "claude_code",
  eventType: "prompt_sent",
  model: "claude-opus-4",
  riskLevel: "high" as const,
  costUsd: 0.0042,
  tokensTotal: 1500,
  inputTokens: 800,
  outputTokens: 700,
  occurredAt: "2026-06-10T14:30:00Z",
  createdAt: "2026-06-10T14:30:00Z",
  user: { id: "u-1", email: "dev@example.com", name: "Dev User" },
  project: { id: "proj-1", name: "My Project" },
  sanitizedContent: "Tell me about this codebase",
  metadata: { foo: "bar" },
  securityFindings: [
    {
      type: "pii",
      severity: "critical",
      description: "Email address detected",
      location: { start: 0, end: 20 },
    },
  ],
};

function renderPage(path = "/events/evt-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EventDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useEvent with orgId and event id from route params", () => {
    mockUseEvent.mockReturnValue({ data: null, isLoading: false });
    renderPage("/events/evt-1");
    expect(mockUseEvent).toHaveBeenCalledWith("org-1", "evt-1");
  });

  it("passes isLoading: true to EventDetail while loading", () => {
    mockUseEvent.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("passes event: null when API returns nothing", () => {
    mockUseEvent.mockReturnValue({ data: null, isLoading: false });
    renderPage();
    expect(screen.getByTestId("no-event")).toBeInTheDocument();
  });

  describe("data wiring", () => {
    beforeEach(() => {
      mockUseEvent.mockReturnValue({ data: mockApiEvent, isLoading: false });
    });

    it("maps toolName → tool_name", () => {
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.tool_name).toBe("claude_code");
    });

    it("maps sanitizedContent → sanitized_content", () => {
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.sanitized_content).toBe("Tell me about this codebase");
    });

    it("maps securityFindings to findings with location string", () => {
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0]).toMatchObject({
        type: "pii",
        severity: "critical",
        description: "Email address detected",
        location: "Characters 0-20",
      });
    });

    it("uses tokensTotal when present", () => {
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.token_count).toBe(1500);
    });

    it("falls back to inputTokens + outputTokens when tokensTotal is null", () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockApiEvent, tokensTotal: null },
        isLoading: false,
      });
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.token_count).toBe(1500); // 800 + 700
    });

    it("omits findings when securityFindings is absent", () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockApiEvent, securityFindings: undefined },
        isLoading: false,
      });
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.findings).toBeUndefined();
    });
  });
});
