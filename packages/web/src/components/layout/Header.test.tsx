import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { MemberRole } from "@/contexts/OrgContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "./Header";

const orgMock = vi.hoisted(() => ({
  currentRole: "owner" as MemberRole,
  currentOrg: { id: "org-1", name: "Test Org", slug: "test" },
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => orgMock,
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/contexts/NotificationsContext", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <Header />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

async function openCommandPalette() {
  const user = userEvent.setup();
  renderHeader();
  await user.click(screen.getByRole("button", { name: /Search/i }));
  return user;
}

describe("Header command palette", () => {
  beforeEach(() => {
    orgMock.currentRole = "owner";
  });

  it("lists every sidebar destination including Billing, Alerts, and Exports", async () => {
    await openCommandPalette();

    const expected = [
      "Dashboard",
      "Billing",
      "Events",
      "Projects",
      "Members",
      "Integrations",
      "Alerts",
      "Settings",
      "Exports",
    ];

    for (const label of expected) {
      expect(screen.getByRole("option", { name: new RegExp(`^${label}$`, "i") })).toBeInTheDocument();
    }
  });

  it("renders a matching menu icon on each navigation item", async () => {
    await openCommandPalette();

    for (const label of ["Billing", "Alerts", "Exports", "Dashboard", "Members"]) {
      const item = screen.getByRole("option", { name: new RegExp(`^${label}$`, "i") });
      expect(item.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("hides owner-only destinations for member role", async () => {
    orgMock.currentRole = "member";
    await openCommandPalette();

    expect(screen.getByRole("option", { name: /^Dashboard$/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Events$/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Billing$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Alerts$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Exports$/i })).not.toBeInTheDocument();
  });
});
