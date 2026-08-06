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
  metadata: { foo: "bar" },
  eventText: {
    userText: "Tell me about this codebase",
    assistantText: "Sure…",
    sanitizedAt: "2026-06-10T14:31:00Z",
  },
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

    it("maps eventText (camelCase) → event_text (snake_case)", () => {
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.event_text).toMatchObject({
        user_text: "Tell me about this codebase",
        assistant_text: "Sure…",
        sanitized_at: "2026-06-10T14:31:00Z",
      });
    });

    it("maps inputTokens → input_tokens and outputTokens → output_tokens", () => {
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.input_tokens).toBe(800);
      expect(data.output_tokens).toBe(700);
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

    it("keeps event_text null when owner has no captured text (key present, value null)", () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockApiEvent, eventText: null },
        isLoading: false,
      });
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data).toHaveProperty("event_text", null);
    });

    it("omits event_text when the API leaves it undefined (non-owner)", () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockApiEvent, eventText: undefined },
        isLoading: false,
      });
      renderPage();
      const data = JSON.parse(screen.getByTestId("event-data").textContent!);
      expect(data.event_text).toBeUndefined();
    });
  });
});
