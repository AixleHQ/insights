import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

const mockHasRole = vi.fn();

// Hoisted so the AuthContext mock factory can read a mutable auth state per test.
const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false } as {
    isAuthenticated: boolean;
    isLoading: boolean;
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => h.auth,
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

function renderRoute(requireRoles?: string[]) {
  return render(
    <MemoryRouter initialEntries={["/integrations/manage"]}>
      <Routes>
        <Route
          path="/integrations/manage"
          element={
            <ProtectedRoute requireRoles={requireRoles}>
              <div>Manage Catalog Page</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute — authentication", () => {
  beforeEach(() => {
    h.auth = { isAuthenticated: true, isLoading: false };
    mockHasRole.mockReset();
  });

  it("redirects to /login when the user is not authenticated", () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    renderRoute();
    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Manage Catalog Page")).not.toBeInTheDocument();
  });

  it("renders children when no requireRoles is specified", () => {
    mockHasRole.mockReturnValue(false);
    renderRoute();
    expect(screen.getByText("Manage Catalog Page")).toBeInTheDocument();
  });
});

describe("ProtectedRoute — requireRoles", () => {
  beforeEach(() => {
    h.auth = { isAuthenticated: true, isLoading: false };
    mockHasRole.mockReset();
  });

  it("renders children when user has the required role", () => {
    mockHasRole.mockReturnValue(true);
    renderRoute(["owner"]);
    expect(screen.getByText("Manage Catalog Page")).toBeInTheDocument();
  });

  it("renders Access Denied when user does not have the required role", () => {
    mockHasRole.mockReturnValue(false);
    renderRoute(["owner"]);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByText("Manage Catalog Page")).not.toBeInTheDocument();
  });

  it("renders children when no requireRoles is specified", () => {
    mockHasRole.mockReturnValue(false);
    renderRoute();
    expect(screen.getByText("Manage Catalog Page")).toBeInTheDocument();
  });
});
