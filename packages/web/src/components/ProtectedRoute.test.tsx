import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

const mockHasRole = vi.fn();

// Hoisted so mock factories can read mutable state per test.
const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false } as {
    isAuthenticated: boolean;
    isLoading: boolean;
  },
  org: {
    currentOrg: { id: "org-1" } as { id: string } | null,
    organizations: [{ id: "org-1" }] as { id: string }[],
    hasInactiveOrganizations: false,
    isLoading: false,
    isInitialized: true,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => h.auth,
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({ ...h.org, hasRole: mockHasRole }),
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
    h.org = {
      currentOrg: { id: "org-1" },
      organizations: [{ id: "org-1" }],
      hasInactiveOrganizations: false,
      isLoading: false,
      isInitialized: true,
    };
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
    h.org = {
      currentOrg: { id: "org-1" },
      organizations: [{ id: "org-1" }],
      hasInactiveOrganizations: false,
      isLoading: false,
      isInitialized: true,
    };
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

describe("ProtectedRoute — inactive org redirect", () => {
  beforeEach(() => {
    h.auth = { isAuthenticated: true, isLoading: false };
    mockHasRole.mockReset();
  });

  it("redirects to /no-active-organization when hasInactiveOrganizations is true and no active orgs", () => {
    h.org = {
      currentOrg: null,
      organizations: [],
      hasInactiveOrganizations: true,
      isLoading: false,
      isInitialized: true,
    };

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/no-active-organization"
            element={<div>No Active Org Page</div>}
          />
          <Route path="/onboarding" element={<div>Onboarding Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("No Active Org Page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("redirects to /onboarding when organizations is empty and hasInactiveOrganizations is false", () => {
    h.org = {
      currentOrg: null,
      organizations: [],
      hasInactiveOrganizations: false,
      isLoading: false,
      isInitialized: true,
    };

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/onboarding" element={<div>Onboarding Page</div>} />
          <Route
            path="/no-active-organization"
            element={<div>No Active Org Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Onboarding Page")).toBeInTheDocument();
  });
});
