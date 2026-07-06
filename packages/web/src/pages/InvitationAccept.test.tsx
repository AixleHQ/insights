import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvitationAccept } from "./InvitationAccept";

const refreshOrganizations = vi.fn().mockResolvedValue(undefined);
const useInvitationByToken = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    profile: { email: "invitee@example.com", name: "Invitee" },
  }),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    refreshOrganizations,
  }),
}));

const mutateAsync = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useInvitationByToken: (...args: unknown[]) => useInvitationByToken(...args),
  useAcceptInvitation: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

function renderInvitation(token = "tok123") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/invitations/${token}`]}>
        <Routes>
          <Route path="/invitations/:token" element={<InvitationAccept />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("InvitationAccept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useInvitationByToken.mockReturnValue({
      data: {
        expired: false,
        status: "pending",
        invitedByName: "Admin",
        organization: { id: "org-1", name: "Acme", slug: "acme" },
        role: "member",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      isLoading: false,
      error: null,
    });
    mutateAsync.mockResolvedValue({
      message: "ok",
      data: {
        organization: { id: "org-1", name: "Acme", slug: "acme" },
        role: "member",
      },
    });
  });

  it("shows setup command and dashboard action after accept instead of auto-redirect", async () => {
    const user = userEvent.setup();
    renderInvitation();

    await user.click(screen.getByRole("button", { name: /accept invitation/i }));

    expect(mutateAsync).toHaveBeenCalledWith("tok123");
    expect(refreshOrganizations).toHaveBeenCalledWith("org-1");

    expect(screen.getByText(/you're connected/i)).toBeInTheDocument();
    expect(screen.getAllByText(/npx -y @aixle\/insights --token <YOUR_INGEST_TOKEN> --host/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/redirecting you to your profile/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to dashboard/i })).toBeInTheDocument();
  });

  it("still shows the success state when organization refresh fails", async () => {
    refreshOrganizations.mockRejectedValueOnce(new Error("refresh failed"));
    const user = userEvent.setup();
    renderInvitation();

    await user.click(screen.getByRole("button", { name: /accept invitation/i }));

    expect(screen.getByText(/you're connected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to dashboard/i })).toBeInTheDocument();
  });

  it("keeps showing the success state after remount for the same accepted token", () => {
    window.sessionStorage.setItem("db90:accepted-invitation:tok123", "true");
    useInvitationByToken.mockReturnValue({
      data: {
        expired: false,
        status: "accepted",
        invitedByName: "Admin",
        organization: { id: "org-1", name: "Acme", slug: "acme" },
        role: "member",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      isLoading: false,
      error: null,
    });

    renderInvitation();

    expect(screen.getByText(/you're connected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/already a member/i)).not.toBeInTheDocument();
  });
});
