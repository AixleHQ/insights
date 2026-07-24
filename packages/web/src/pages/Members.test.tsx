import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MemberRole } from "@/contexts/OrgContext";
import type { OrganizationMember } from "@/lib/types";
import { Members } from "./Members";

beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const orgMock = vi.hoisted(() => ({
  currentRole: "owner" as MemberRole,
  currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
  currentMembership: { role: "owner" as MemberRole, organization: { id: "org-1" } },
  organizations: [{ id: "org-1" }],
  setCurrentOrg: vi.fn(),
  refreshOrganizations: vi.fn(),
}));

const mockUseOrganizationMembers = vi.fn();
const mockUseInvitations = vi.fn();
const mockUseMemberRemovalPreview = vi.fn();

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => orgMock,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { sub: "user-owner", email: "owner@example.com", name: "Owner User" },
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useOrganizationMembers: (...args: unknown[]) => mockUseOrganizationMembers(...args),
  useInvitations: (...args: unknown[]) => mockUseInvitations(...args),
  useUpdateMemberRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLeaveOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMemberRemovalPreview: (...args: unknown[]) => mockUseMemberRemovalPreview(...args),
  useRevokeInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetentionPolicy: () => ({ data: { toolEventsRetention: "90_days", costThresholdCents: null, tokenThreshold: null }, isLoading: false }),
  useUpdateRetentionPolicy: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useNotificationRoutes: () => ({ data: [] }),
  useCreateNotificationRoute: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useUpdateNotificationRoute: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteNotificationRoute: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockMembers: OrganizationMember[] = [
  {
    id: "mem-owner",
    organization_id: "org-1",
    role: "owner",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    user: { id: "user-owner", email: "owner@example.com", name: "Owner User", avatarUrl: null },
    total_events: 120,
    total_cost: 45.5,
    last_active_at: new Date().toISOString(),
  },
  {
    id: "mem-alice",
    organization_id: "org-1",
    role: "member",
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-02-01T00:00:00Z",
    user: { id: "user-alice", email: "alice@example.com", name: "Alice Member", avatarUrl: "https://example.com/alice-avatar.png" },
    total_events: 42,
    total_cost: 12.25,
    last_active_at: null,
  },
  {
    id: "mem-viewer",
    organization_id: "org-1",
    role: "viewer",
    created_at: "2024-03-01T00:00:00Z",
    updated_at: "2024-03-01T00:00:00Z",
    user: { id: "user-viewer", email: "viewer@example.com", name: "Viewer User" },
    total_events: 0,
    total_cost: 0,
    last_active_at: null,
  },
];

function renderMembers(initialEntry = "/members") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<div>Member profile page</div>} />
          <Route path="/profile" element={<div>Profile page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setupDefaultMocks() {
  mockUseOrganizationMembers.mockReturnValue({ data: mockMembers, isLoading: false });
  mockUseInvitations.mockReturnValue({ data: [], isLoading: false });
  mockUseMemberRemovalPreview.mockReturnValue({
    data: { sole_owner_projects: [], new_owner: null },
    isLoading: false,
  });
}

describe("Members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgMock.currentRole = "owner";
    orgMock.currentMembership = { role: "owner", organization: { id: "org-1" } };
    setupDefaultMocks();
  });

  describe("owner access", () => {
    it("renders the page heading and table columns", () => {
      renderMembers();

      expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /seat type/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /last active/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /events/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /cost/i })).toBeInTheDocument();
    });

    it("renders member rows with events and cost", () => {
      renderMembers();

      expect(screen.getByText("Alice Member")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("$12.25")).toBeInTheDocument();
      expect(screen.getAllByText("Never").length).toBeGreaterThan(0);
    });

    it("links Add Member to /members/invite", () => {
      renderMembers();

      const addLink = screen.getByRole("link", { name: /add member/i });
      expect(addLink).toHaveAttribute("href", "/members/invite");
    });

    it("filters members by search text", async () => {
      const user = userEvent.setup();
      renderMembers();

      await user.type(screen.getByPlaceholderText(/search members/i), "alice");

      expect(screen.getByText("Alice Member")).toBeInTheDocument();
      expect(screen.queryByText("Viewer User")).not.toBeInTheDocument();
    });

    it("filters members by seat type", async () => {
      const user = userEvent.setup();
      renderMembers();

      await user.click(screen.getByText("All Seat Types").closest("button")!);
      await user.click(screen.getByRole("option", { name: "Viewer" }));

      expect(screen.getByText("Viewer User")).toBeInTheDocument();
      expect(screen.queryByText("Alice Member")).not.toBeInTheDocument();
    });

    it("renders one avatar per member row without crashing when avatarUrl is provided", () => {
      const { container } = renderMembers();

      // Radix AvatarImage does not produce a visible <img> in JSDOM (images cannot load),
      // but the Avatar component must render without errors. We verify that the correct
      // number of avatar slots are rendered — one per member — confirming the avatar_url
      // mapping from m.user.avatarUrl does not break the component tree.
      const avatarSlots = container.querySelectorAll('[data-slot="avatar"]');
      expect(avatarSlots.length).toBe(mockMembers.length);
    });

    it("navigates to member profile when a row is clicked", async () => {
      const user = userEvent.setup();
      renderMembers();

      const aliceRow = screen.getByText("Alice Member").closest("tr");
      expect(aliceRow).not.toBeNull();
      await user.click(aliceRow!);

      expect(screen.getByText("Member profile page")).toBeInTheDocument();
    });

    it("shows pending invitations when present", () => {
      mockUseInvitations.mockReturnValue({
        data: [
          {
            id: "inv-1",
            email: "pending@example.com",
            role: "member",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
        isLoading: false,
      });

      renderMembers();

      expect(screen.getByText(/pending invitations/i)).toBeInTheDocument();
      expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    });

    it("shows sole-owner message when the current user is the only owner", () => {
      renderMembers();

      expect(screen.getByText(/you are the sole owner/i)).toBeInTheDocument();
    });

    it("shows sole-owner project transfer details in the remove confirmation", async () => {
      const user = userEvent.setup();
      mockUseMemberRemovalPreview.mockReturnValue({
        data: {
          sole_owner_projects: [{ id: "proj-1", name: "Alpha Project" }],
          new_owner: { id: "user-owner", name: "Owner User", email: "owner@example.com" },
        },
        isLoading: false,
      });

      renderMembers();

      const aliceRow = screen.getByText("Alice Member").closest("tr");
      await user.click(aliceRow!.querySelector("button")!);
      await user.click(screen.getByRole("menuitem", { name: /^remove$/i }));

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(/they are the sole owner of this project/i);
      expect(dialog).toHaveTextContent("Alpha Project");
      expect(dialog).toHaveTextContent(/Owner User will become the new owner of this project/i);
    });

    it("shows leave confirmation with project transfer details when another owner exists", async () => {
      const user = userEvent.setup();
      mockUseOrganizationMembers.mockReturnValue({
        data: [
          ...mockMembers,
          {
            id: "mem-owner-2",
            organization_id: "org-1",
            role: "owner",
            created_at: "2024-01-02T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
            user: { id: "user-owner-2", email: "owner2@example.com", name: "Second Owner", avatarUrl: null },
            total_events: 0,
            total_cost: 0,
            last_active_at: null,
          },
        ],
        isLoading: false,
      });
      mockUseMemberRemovalPreview.mockReturnValue({
        data: {
          sole_owner_projects: [
            { id: "proj-1", name: "Beta Project" },
            { id: "proj-2", name: "Gamma Project" },
          ],
          new_owner: { id: "user-owner-2", name: "Second Owner", email: "owner2@example.com" },
        },
        isLoading: false,
      });

      renderMembers();

      await user.click(screen.getByRole("button", { name: /^leave$/i }));

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(/you are the sole owner of these projects/i);
      expect(dialog).toHaveTextContent("Beta Project");
      expect(dialog).toHaveTextContent("Gamma Project");
      expect(dialog).toHaveTextContent(/Second Owner will become the new owner of these projects/i);
    });
  });

  describe("non-owner access", () => {
    beforeEach(() => {
      orgMock.currentRole = "member";
      orgMock.currentMembership = { role: "member", organization: { id: "org-1" } };
    });

    it("redirects to profile", () => {
      renderMembers();

      expect(screen.getByText("Profile page")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Members" })).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows skeleton rows while loading", () => {
      mockUseOrganizationMembers.mockReturnValue({ data: undefined, isLoading: true });
      const { container } = renderMembers();

      expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
      expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
    });
  });
});
