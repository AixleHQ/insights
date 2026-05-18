import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserSettings } from "./UserSettings";

const notificationSettings = vi.hoisted<{ value: Record<string, string> }>(() => ({ value: {} }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { name: "Test User", email: "test@example.com" },
  }),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/hooks/useApi", () => {
  const mockUser = {
    id: "u1",
    email: "test@example.com",
    name: "Test User",
    avatarUrl: null as string | null,
    role: "member" as const,
    super_admin: false,
    settings: {} as Record<string, string>,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    lastSignInAt: "2024-06-01T10:00:00Z",
  };

  const mockOrgs = [
    {
      id: "test-org-id",
      name: "Test Org",
      slug: "test-org",
      logo_url: null,
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ];

  return {
  useToolAccounts: () => ({ data: [], isLoading: false }),
  useCreateToolAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteToolAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateToolAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOrganizationMembers: () => ({
    data: [
      {
        id: "member-m1",
        user_id: "u1",
        organization_id: "test-org-id",
        role: "member" as const,
        user: mockUser,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ],
  }),
  useMember: () => ({
    data: {
      id: "member-m1",
      user_id: "u1",
      organization_id: "test-org-id",
      role: "member" as const,
      user: mockUser,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    isLoading: false,
  }),
  useMemberStats: () => ({
    data: {
      total_events: 0,
      total_cost: 0,
      events_today: 0,
      events_this_week: 0,
      events_this_month: 0,
      most_used_tool: null,
      tokens: { total_in: 0, total_out: 0, total: 0 },
      tool_breakdown: [],
      model_breakdown: [],
      daily_activity: [],
      projects: [],
      organizations: [],
      tool_accounts: [],
    },
  }),
  useMemberEvents: () => ({
    data: { data: [] },
    isLoading: false,
  }),
  useProject: () => ({ data: null, isLoading: false }),
  useEvents: () => ({
    data: { data: [], meta: { current_page: 1, total_pages: 0, total_count: 0, per_page: 10 } },
    isLoading: false,
  }),
  useCurrentUser: () => ({ data: { ...mockUser, settings: notificationSettings.value } }),
  useUpdateCurrentUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUserOrganizations: () => ({ data: mockOrgs, isLoading: false }),
  useUpdateUserSetting: () => ({ mutate: vi.fn(), isPending: false }),
  usePersonalSettings: () => ({ data: undefined, isLoading: false }),
  useUpdatePersonalSettings: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function renderAtPath(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile/*" element={<UserSettings />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationSettings.value = {};
  });

  describe("Header", () => {
    it("renders the page heading", () => {
      renderAtPath("/profile");
      expect(screen.getByRole("heading", { name: "User Settings" })).toBeInTheDocument();
    });
  });

  describe("Sidebar navigation", () => {
    it("renders all 5 nav links", () => {
      renderAtPath("/profile");

      expect(screen.getByRole("link", { name: /profile/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /preferences/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /security/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /tools/i })).toBeInTheDocument();
    });

    it("marks Profile as active on the index route", () => {
      renderAtPath("/profile");

      expect(screen.getByRole("link", { name: /profile/i }).className).toMatch(/text-primary/);
    });

    it("marks Preferences as active on /profile/settings", () => {
      renderAtPath("/profile/settings");

      expect(screen.getByRole("link", { name: /preferences/i }).className).toMatch(/text-primary/);
    });

    it("marks Notifications as active on /profile/settings/notifications", () => {
      renderAtPath("/profile/settings/notifications");

      expect(screen.getByRole("link", { name: /notifications/i }).className).toMatch(/text-primary/);
    });

    it("marks Security as active on /profile/settings/security", () => {
      renderAtPath("/profile/settings/security");

      expect(screen.getByRole("link", { name: /security/i }).className).toMatch(/text-primary/);
    });

    it("marks Tools as active on /profile/tools", () => {
      renderAtPath("/profile/tools");

      expect(screen.getByRole("link", { name: /tools/i }).className).toMatch(/text-primary/);
    });
  });

  describe("Section content", () => {
    it("renders profile info on the index route", () => {
      renderAtPath("/profile");

      expect(screen.getByText("Test User")).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("renders embedded org member activity below the profile card", () => {
      renderAtPath("/profile");

      expect(screen.getByText("Total Events")).toBeInTheDocument();
    });

    it("renders Preferences section at /profile/settings", () => {
      renderAtPath("/profile/settings");

      expect(screen.getByText("Customize your experience in DB90.")).toBeInTheDocument();
      expect(screen.getByLabelText("Theme")).toBeInTheDocument();
      expect(screen.getByLabelText("Default Organization")).toBeInTheDocument();
    });

    it("renders Notifications section at /profile/settings/notifications", () => {
      renderAtPath("/profile/settings/notifications");

      expect(screen.getByText("Control how and when you receive notifications.")).toBeInTheDocument();
      expect(screen.getByLabelText("In-app risk alerts")).toBeInTheDocument();
      expect(screen.getByLabelText("In-app cost alerts")).toBeInTheDocument();
      expect(screen.getByLabelText("Weekly email digest")).toBeInTheDocument();
      expect(screen.getByLabelText("Alert emails")).toBeInTheDocument();
    });

    it("renders notification toggles as unchecked by default", () => {
      renderAtPath("/profile/settings/notifications");

      const switches = screen.getAllByRole("switch");
      expect(switches).toHaveLength(4);
      switches.forEach((sw) => expect(sw).not.toBeChecked());
    });

    it('checks toggles whose setting value is "true"', () => {
      notificationSettings.value = { notify_in_app_risk: "true" };

      renderAtPath("/profile/settings/notifications");

      expect(screen.getByLabelText("In-app risk alerts")).toBeChecked();
      expect(screen.getByLabelText("In-app cost alerts")).not.toBeChecked();
      expect(screen.getByLabelText("Weekly email digest")).not.toBeChecked();
      expect(screen.getByLabelText("Alert emails")).not.toBeChecked();
    });

    describe("SecuritySection", () => {
      it("renders the email address", () => {
        renderAtPath("/profile/settings/security");

        expect(screen.getByText("test@example.com")).toBeInTheDocument();
      });

      it("renders the last sign-in timestamp", () => {
        renderAtPath("/profile/settings/security");

        expect(screen.queryByText("No sign-in recorded")).not.toBeInTheDocument();
        expect(screen.getByText("Last sign-in").closest("div")).not.toBeEmptyDOMElement();
      });

      it("renders the identity provider informational text", () => {
        renderAtPath("/profile/settings/security");

        expect(screen.getByText(/identity provider/i)).toBeInTheDocument();
      });
    });

    it("renders Tools section at /profile/tools", () => {
      renderAtPath("/profile/tools");

      expect(screen.getByRole("tab", { name: /available/i })).toBeInTheDocument();
    });

    it("does not render ToolAccounts back button when embedded", () => {
      renderAtPath("/profile/tools");

      expect(screen.queryByRole("link", { name: /back to settings/i })).not.toBeInTheDocument();
    });
  });
});
