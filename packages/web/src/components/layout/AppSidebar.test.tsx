import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { MemberRole, OrganizationMembership } from "@/contexts/OrgContext";
import type { FavoriteProject } from "@/hooks/useFavorites";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

// Radix's Avatar.Image only mounts an <img> after an offscreen preload reports
// "loaded", which never happens in jsdom — render a plain <img> synchronously
// instead so tests can assert on avatarSrc without simulating image loads.
vi.mock("@radix-ui/react-avatar", async () => {
  const actual = await vi.importActual<typeof import("@radix-ui/react-avatar")>(
    "@radix-ui/react-avatar",
  );
  return {
    ...actual,
    Image: (props: ComponentProps<"img">) => <img {...props} />,
  };
});

// Hoisted mutable values so mock factories can read them at render time
const orgMock = vi.hoisted(() => ({
  currentRole: "owner" as MemberRole,
  currentOrg: { id: "org-1", name: "Test Org", slug: "test" },
  memberships: [] as OrganizationMembership[],
  setCurrentOrg: vi.fn(),
  refreshOrganizations: vi.fn(),
}));

const favoritesMock = vi.hoisted(() => ({
  favorites: [] as FavoriteProject[],
  toggleFavorite: vi.fn(),
  isFavorite: vi.fn(() => false),
}));

const authMock = vi.hoisted(() => ({
  profile: { name: "Test User", email: "test@example.com" } as {
    name: string;
    email: string;
    picture?: string;
  },
  logout: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock,
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => orgMock,
}));

const impersonationMock = vi.hoisted(() => ({
  isImpersonating: false,
}));

const currentUserMock = vi.hoisted(() => ({
  data: { name: "Test User", email: "test@example.com", avatarUrl: null } as {
    name: string;
    email: string;
    avatarUrl: string | null;
  } | undefined,
}));

vi.mock("@/contexts/ImpersonationContext", () => ({
  useImpersonation: () => impersonationMock,
}));

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => currentUserMock,
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
    impersonationMock.isImpersonating = false;
    authMock.profile = { name: "Test User", email: "test@example.com" };
    currentUserMock.data = { name: "Test User", email: "test@example.com", avatarUrl: null };
  });

  describe("owner role", () => {
    it("shows all 7 nav items", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Events/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Members/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Integrations/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Alerts/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Library/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Feedback/i })).not.toBeInTheDocument();
    });

    it("does not show Profile as a sidebar nav item", () => {
      renderSidebar();
      // Profile must not appear as a direct nav link — only inside the avatar dropdown
      expect(screen.queryByRole("link", { name: /^Profile$/i })).not.toBeInTheDocument();
    });

    it("links Members to /members", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /^Members$/i })).toHaveAttribute("href", "/members");
    });
  });

  describe("member role", () => {
    beforeEach(() => {
      orgMock.currentRole = "member";
    });

    it("shows Dashboard, Events, Projects", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Events/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Library/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Feedback/i })).not.toBeInTheDocument();
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

    it("shows Dashboard, Events, Projects", () => {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Events/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Library/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Feedback/i })).not.toBeInTheDocument();
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

  describe("UserMenu Settings", () => {
    async function openUserMenu() {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Test User/i }));
    }

    it("shows Settings in the avatar menu for owner", async () => {
      orgMock.currentRole = "owner";
      renderSidebar();
      await openUserMenu();
      expect(screen.getByRole("menuitem", { name: /Settings/i })).toBeInTheDocument();
    });

    it("hides Settings in the avatar menu for member", async () => {
      orgMock.currentRole = "member";
      renderSidebar();
      await openUserMenu();
      expect(screen.queryByRole("menuitem", { name: /Settings/i })).not.toBeInTheDocument();
    });

    it("hides Settings in the avatar menu for viewer", async () => {
      orgMock.currentRole = "viewer";
      renderSidebar();
      await openUserMenu();
      expect(screen.queryByRole("menuitem", { name: /Settings/i })).not.toBeInTheDocument();
    });
  });

  describe("UserMenu during impersonation", () => {
    it("does not fall back to admin Keycloak profile when currentUser is loading", () => {
      impersonationMock.isImpersonating = true;
      currentUserMock.data = undefined;

      renderSidebar();

      // Admin profile is "Test User" / test@example.com — must not appear while
      // impersonating with no /users/me payload yet.
      expect(screen.queryByText("Test User")).not.toBeInTheDocument();
      expect(screen.queryByText("test@example.com")).not.toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
    });

    it("shows impersonated user from currentUser when available", () => {
      impersonationMock.isImpersonating = true;
      currentUserMock.data = {
        name: "Edsger Dijkstra",
        email: "ana@example.com",
        avatarUrl: null,
      };

      renderSidebar();

      expect(screen.getByText("Edsger Dijkstra")).toBeInTheDocument();
      expect(screen.getByText("ana@example.com")).toBeInTheDocument();
      expect(screen.queryByText("Test User")).not.toBeInTheDocument();
    });
  });

  describe("UserMenu avatar", () => {
    it("uses currentUser.avatarUrl when set", () => {
      currentUserMock.data = {
        name: "Test User",
        email: "test@example.com",
        avatarUrl: "https://example.com/uploaded-avatar.png",
      };
      authMock.profile = { name: "Test User", email: "test@example.com", picture: "https://keycloak.example.com/picture.png" };
      renderSidebar();
      expect(screen.getByRole("img", { name: /Test User/i })).toHaveAttribute(
        "src",
        "https://example.com/uploaded-avatar.png",
      );
    });

    it("falls back to the Keycloak picture only while currentUser hasn't loaded yet", () => {
      currentUserMock.data = undefined;
      authMock.profile = { name: "Test User", email: "test@example.com", picture: "https://keycloak.example.com/picture.png" };
      renderSidebar();
      expect(screen.getByRole("img", { name: /Test User/i })).toHaveAttribute(
        "src",
        "https://keycloak.example.com/picture.png",
      );
    });

    it("does not fall back to the Keycloak picture once currentUser has loaded with no avatar (e.g. just removed)", () => {
      currentUserMock.data = { name: "Test User", email: "test@example.com", avatarUrl: null };
      authMock.profile = { name: "Test User", email: "test@example.com", picture: "https://keycloak.example.com/picture.png" };
      renderSidebar();
      expect(screen.queryByRole("img", { name: /Test User/i })).not.toBeInTheDocument();
    });
  });
});
