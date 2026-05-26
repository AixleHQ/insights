import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MemberRole } from "@/contexts/OrgContext";
import { SecuritySettings } from "./Settings";

beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const makeOrgMock = (role: MemberRole) => ({
  currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
  currentRole: role,
  currentMembership: { role, organization: { id: "org-1" } },
  organizations: [{ id: "org-1" }],
  setCurrentOrg: vi.fn(),
  refreshOrganizations: vi.fn(),
  hasRole: (r: string | string[]) => {
    const roles = Array.isArray(r) ? r : [r];
    return roles.includes(role);
  },
});

const makeUserMock = (globalAdmin = false) => ({
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  globalAdmin,
  super_admin: false,
});

let orgMock = makeOrgMock("owner");
let userMock = makeUserMock(false);

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => orgMock,
}));

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => ({ data: userMock }),
  useOrganizationAuditLogs: () => ({ data: { data: [], meta: { current_page: 1, total_pages: 1, total_count: 0, per_page: 20 } }, isLoading: false }),
}));

vi.mock("@/components/audit/UnifiedAuditTimelineTab", () => ({
  UnifiedAuditTimelineTab: () => <div data-testid="unified-timeline-tab">Unified Timeline</div>,
}));

function renderSecuritySettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SecuritySettings />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("SecuritySettings — Unified Timeline tab visibility", () => {
  it("shows the Unified Timeline tab for org owners", () => {
    orgMock = makeOrgMock("owner");
    userMock = makeUserMock(false);
    renderSecuritySettings();
    expect(screen.getByRole("tab", { name: /unified timeline/i })).toBeInTheDocument();
  });

  it("hides the Unified Timeline tab for org members (non-owner)", () => {
    orgMock = makeOrgMock("member");
    userMock = makeUserMock(false);
    renderSecuritySettings();
    expect(screen.queryByRole("tab", { name: /unified timeline/i })).not.toBeInTheDocument();
  });

  it("hides the Unified Timeline tab for org viewers (non-owner)", () => {
    orgMock = makeOrgMock("viewer");
    userMock = makeUserMock(false);
    renderSecuritySettings();
    expect(screen.queryByRole("tab", { name: /unified timeline/i })).not.toBeInTheDocument();
  });

  it("shows the Unified Timeline tab for globalAdmin even with member role", () => {
    orgMock = makeOrgMock("member");
    userMock = makeUserMock(true);
    renderSecuritySettings();
    expect(screen.getByRole("tab", { name: /unified timeline/i })).toBeInTheDocument();
  });

  it("always shows the Organization tab regardless of role", () => {
    orgMock = makeOrgMock("member");
    userMock = makeUserMock(false);
    renderSecuritySettings();
    expect(screen.getByRole("tab", { name: /^organization$/i })).toBeInTheDocument();
  });
});
