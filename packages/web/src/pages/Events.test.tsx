import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Events } from "./Events";

// --- mocks ---

const mockHasRole = vi.fn();
const mockCurrentOrg = { id: "org-1", name: "Acme", slug: "acme", is_active: true };

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: mockCurrentOrg,
    hasRole: mockHasRole,
    currentRole: "member",
  }),
}));

const mockCurrentUser = vi.fn();
const mockEvents = vi.fn();
const mockProjects = vi.fn();
const mockOrgMembers = vi.fn();
const mockEventsSummary = vi.fn();
const mockExportEvents = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => mockCurrentUser(),
  useEvents: (...args: unknown[]) => mockEvents(...args),
  useEvent: () => ({ data: undefined, isLoading: false }),
  useProjects: () => mockProjects(),
  useOrganizationMembers: () => mockOrgMembers(),
  useEventsSummary: () => mockEventsSummary(),
  useExportEvents: () => mockExportEvents(),
  queryKeys: {
    events: { all: (_id: string, _params: unknown) => ["organizations", _id, "events", _params] },
  },
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useEventsPageUpdates: () => undefined,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

// The "orgMembers" cache is shared with Profile/Members pages, which fetch it
// for every role — so it can be populated even when the current user is not
// an owner/platform-admin. Assert that value stays non-empty in this test to
// prove Events.tsx itself (not the query) is what withholds it from EventFilters.
const sharedOrgMembers = [
  { id: "mem-1", user: { id: "user-1", email: "jane@example.com", name: "Jane Doe" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockHasRole.mockReturnValue(false);
  mockCurrentUser.mockReturnValue({ data: { globalAdmin: false, super_admin: false }, isLoading: false });
  mockEvents.mockReturnValue({
    data: { data: [], meta: { total_pages: 1, total_count: 0 } },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockProjects.mockReturnValue({ data: [] });
  mockOrgMembers.mockReturnValue({ data: sharedOrgMembers });
  mockEventsSummary.mockReturnValue({ data: { byTool: {} } });
  mockExportEvents.mockReturnValue({ exportEvents: vi.fn(), isExporting: false });
});

function renderPage(path = "/events") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Events />
    </MemoryRouter>
  );
}

async function openFilters() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /filters/i }));
  return user;
}

const lastApiParams = () => mockEvents.mock.calls.at(-1)?.[1];

describe("Events page User filter gating", () => {
  it("hides the User filter sub-menu for a plain member, even with cached member data", async () => {
    mockHasRole.mockReturnValue(false);
    mockCurrentUser.mockReturnValue({ data: { globalAdmin: false, super_admin: false }, isLoading: false });
    renderPage();

    await openFilters();

    expect(screen.queryByRole("menuitem", { name: "User" })).not.toBeInTheDocument();
  });

  it("shows the User filter sub-menu for an org owner", async () => {
    mockHasRole.mockReturnValue(true);
    renderPage();

    await openFilters();

    expect(screen.getByRole("menuitem", { name: "User" })).toBeInTheDocument();
  });

  it("shows the User filter sub-menu for a platform admin (non-owner)", async () => {
    mockHasRole.mockReturnValue(false);
    mockCurrentUser.mockReturnValue({ data: { globalAdmin: true }, isLoading: false });
    renderPage();

    await openFilters();

    expect(screen.getByRole("menuitem", { name: "User" })).toBeInTheDocument();
  });
});

describe("Events — URL filter hydration (AIX-565)", () => {
  it("hydrates projectIds and date range from a dashboard 'View all' deep-link", () => {
    renderPage("/events?project_id=proj-1&date_from=2026-07-01&date_to=2026-07-31");

    const params = lastApiParams();
    expect(params.project_id).toEqual(["proj-1"]);
    expect(params.start_date).toBe("2026-07-01");
    expect(params.end_date).toBe("2026-07-31");
  });

  it("hydrates the 'No Project' sentinel from project_id=none", () => {
    renderPage("/events?project_id=none");

    expect(lastApiParams().project_id).toEqual(["none"]);
  });

  it("leaves filters empty when no query params are present (unfiltered visit)", () => {
    renderPage("/events");

    const params = lastApiParams();
    expect(params.project_id).toBeUndefined();
    expect(params.start_date).toBeUndefined();
    expect(params.end_date).toBeUndefined();
  });
});
