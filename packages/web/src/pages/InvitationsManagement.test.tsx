import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const mockHasRole = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1" },
    organizations: [{ id: "org-1" }],
    hasRole: mockHasRole,
    isLoading: false,
    isInitialized: true,
  }),
}));

function renderInviteRoute(path: "/members/invite" | "/members/invitations") {
  const label = path === "/members/invite" ? "Team Invite Page" : "Invitations Page";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <ProtectedRoute requireRoles={["owner"]}>
              <div>{label}</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("AIX-185 — invite route guards", () => {
  describe("/members/invite", () => {
    it("renders for owners", () => {
      mockHasRole.mockReturnValue(true);
      renderInviteRoute("/members/invite");
      expect(screen.getByText("Team Invite Page")).toBeInTheDocument();
    });

    it("renders Access Denied for members", () => {
      mockHasRole.mockReturnValue(false);
      renderInviteRoute("/members/invite");
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByText("Team Invite Page")).not.toBeInTheDocument();
    });

    it("renders Access Denied for viewers", () => {
      mockHasRole.mockReturnValue(false);
      renderInviteRoute("/members/invite");
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });

  describe("/members/invitations", () => {
    it("renders for owners", () => {
      mockHasRole.mockReturnValue(true);
      renderInviteRoute("/members/invitations");
      expect(screen.getByText("Invitations Page")).toBeInTheDocument();
    });

    it("renders Access Denied for members", () => {
      mockHasRole.mockReturnValue(false);
      renderInviteRoute("/members/invitations");
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByText("Invitations Page")).not.toBeInTheDocument();
    });

    it("renders Access Denied for viewers", () => {
      mockHasRole.mockReturnValue(false);
      renderInviteRoute("/members/invitations");
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });
});
