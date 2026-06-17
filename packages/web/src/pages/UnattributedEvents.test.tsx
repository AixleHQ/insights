import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UnattributedEvents } from "./UnattributedEvents";

// --- mocks ---

const mockHasRole = vi.fn();
const mockCurrentOrg = { id: "org-1", name: "Acme", slug: "acme", is_active: true };

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: mockCurrentOrg,
    hasRole: mockHasRole,
  }),
}));

const mockCurrentUser = vi.fn();
const mockUnattributedEvents = vi.fn();
const mockOrgMembers = vi.fn();
const mockAttributeEvent = vi.fn();
const mockBulkAttributeEvents = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => mockCurrentUser(),
  useUnattributedEvents: () => mockUnattributedEvents(),
  useOrganizationMembers: () => mockOrgMembers(),
  useAttributeEvent: () => mockAttributeEvent(),
  useBulkAttributeEvents: () => mockBulkAttributeEvents(),
  queryKeys: { events: { unattributed: (_id: string) => ["events", "unattributed", _id] } },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

// --- helpers ---

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={["/events/unattributed"]}>
        <Routes>
          <Route path="/events/unattributed" element={<UnattributedEvents />} />
          <Route path="/events" element={<div data-testid="events-page">events</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// --- default mock state ---

beforeEach(() => {
  vi.clearAllMocks();
  mockHasRole.mockReturnValue(false);
  mockCurrentUser.mockReturnValue({ data: { globalAdmin: false, super_admin: false }, isLoading: false });
  mockUnattributedEvents.mockReturnValue({ data: [], isLoading: false, isFetching: false });
  mockOrgMembers.mockReturnValue({ data: [] });
  mockAttributeEvent.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockBulkAttributeEvents.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

// --- tests ---

describe("UnattributedEvents access gate", () => {
  it("redirects member to /events", () => {
    mockHasRole.mockReturnValue(false);
    mockCurrentUser.mockReturnValue({ data: { globalAdmin: false }, isLoading: false });
    renderPage();
    expect(screen.getByTestId("events-page")).toBeInTheDocument();
    expect(screen.queryByText("Unattributed Events")).not.toBeInTheDocument();
  });

  it("renders page for org owner", () => {
    mockHasRole.mockReturnValue(true);
    renderPage();
    expect(screen.getByText("Unattributed Events")).toBeInTheDocument();
    expect(screen.queryByTestId("events-page")).not.toBeInTheDocument();
  });

  it("renders page for platform admin (non-owner)", () => {
    mockHasRole.mockReturnValue(false);
    mockCurrentUser.mockReturnValue({ data: { globalAdmin: true }, isLoading: false });
    renderPage();
    expect(screen.getByText("Unattributed Events")).toBeInTheDocument();
    expect(screen.queryByTestId("events-page")).not.toBeInTheDocument();
  });

  it("shows skeleton while platform-admin status is loading (does not redirect)", () => {
    mockHasRole.mockReturnValue(false);
    mockCurrentUser.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText("Unattributed Events")).toBeInTheDocument();
    expect(screen.queryByTestId("events-page")).not.toBeInTheDocument();
  });
});

describe("UnattributedEvents empty state", () => {
  it("shows empty state when all events are attributed", () => {
    mockHasRole.mockReturnValue(true);
    mockUnattributedEvents.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderPage();
    expect(screen.getByText("All events are attributed")).toBeInTheDocument();
  });
});
