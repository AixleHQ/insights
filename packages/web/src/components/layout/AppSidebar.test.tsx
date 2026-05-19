import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MemberRole } from "@/contexts/OrgContext";
import type { FavoriteProject } from "@/hooks/useFavorites";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

// Hoisted mutable values so mock factories can read them at render time
const orgMock = vi.hoisted(() => ({
  currentRole: "owner" as MemberRole,
  currentOrg: { id: "org-1", name: "Test Org", slug: "test" },
  memberships: [] as [],
  setCurrentOrg: vi.fn(),
  refreshOrganizations: vi.fn(),
}));

const favoritesMock = vi.hoisted(() => ({
  favorites: [] as FavoriteProject[],
  toggleFavorite: vi.fn(),
  isFavorite: vi.fn(() => false),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { name: "Test User", email: "test@example.com" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => orgMock,
}));

vi.mock("@/contexts/ImpersonationContext", () => ({
  useImpersonation: () => ({ isImpersonating: false }),
}));

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => ({
    data: { name: "Test User", email: "test@example.com", avatarUrl: null },
  }),
  useCreateOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => favoritesMock,
}));

function renderSidebar(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    orgMock.currentRole = "owner";
    favoritesMock.favorites = [];
  });

  describe("owner role", () => {
    it("shows all 8 nav items", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Events/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Members/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Integrations/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Library/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Feedback/i })).toBeInTheDocument();
    });

    it("does not show Profile as a sidebar nav item", () => {
      renderSidebar();
      // Profile must not appear as a direct nav link — only inside the avatar dropdown
      expect(screen.queryByRole("link", { name: /^Profile$/i })).not.toBeInTheDocument();
    });
  });

  describe("member role", () => {
    beforeEach(() => {
      orgMock.currentRole = "member";
    });

    it("shows Dashboard, Events, Projects, Library, Feedback", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Events/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Library/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Feedback/i })).toBeInTheDocument();
    });

    it("hides Members, Integrations, Settings", () => {
      renderSidebar();
      expect(screen.queryByRole("link", { name: /^Members$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^Integrations$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^Settings$/i })).not.toBeInTheDocument();
    });
  });

  describe("viewer role", () => {
    beforeEach(() => {
      orgMock.currentRole = "viewer";
    });

    it("shows Dashboard, Events, Projects, Library, Feedback", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Events/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Library/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Feedback/i })).toBeInTheDocument();
    });

    it("hides Members, Integrations, Settings", () => {
      renderSidebar();
      expect(screen.queryByRole("link", { name: /^Members$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^Integrations$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^Settings$/i })).not.toBeInTheDocument();
    });
  });

  describe("Favorites section", () => {
    it("is absent when favorites list is empty", () => {
      renderSidebar();
      expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    });

    it("shows pinned project name as a link when favorites exist", () => {
      favoritesMock.favorites = [{ id: "p1", name: "My Favorite Project" }];
      renderSidebar();
      expect(screen.getByText("Favorites")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /My Favorite Project/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Active route", () => {
    it("marks Events as active when on /events", () => {
      renderSidebar("/events");
      const eventsLink = screen.getByRole("link", { name: /Events/i });
      expect(eventsLink).toHaveAttribute("data-active", "true");
    });

    it("does not mark Dashboard as active when on /events", () => {
      renderSidebar("/events");
      const dashboardLink = screen.getByRole("link", { name: /Dashboard/i });
      expect(dashboardLink).not.toHaveAttribute("data-active", "true");
    });
  });
});
