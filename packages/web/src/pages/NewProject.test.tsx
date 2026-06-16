import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewProject } from "./NewProject";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const mockNavigate = vi.fn();
const mockMutateAsync = vi.fn();
const mockCurrentOrg = vi.fn(() => ({ id: "org-1", name: "Test Org", slug: "test-org" }));
const mockHasRole = vi.fn(() => true);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useApi", () => ({
  useCreateProject: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: mockCurrentOrg(),
    organizations: [{ id: "org-1" }],
    hasRole: mockHasRole,
    isLoading: false,
    isInitialized: true,
  }),
}));

vi.mock("@/components/projects", () => ({
  ProjectForm: ({ onSubmit }: { onSubmit: (data: unknown) => Promise<void> }) => (
    <button data-testid="submit" onClick={() => onSubmit({ name: "My Project" })}>
      Submit
    </button>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NewProject />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NewProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentOrg.mockReturnValue({ id: "org-1", name: "Test Org", slug: "test-org" });
    mockHasRole.mockReturnValue(true);
  });

  it("renders ProjectForm", () => {
    renderPage();
    expect(screen.getByTestId("submit")).toBeInTheDocument();
  });

  it("calls createProject.mutateAsync with correct shape on submit", async () => {
    mockMutateAsync.mockResolvedValue({ id: "proj-new" });
    renderPage();
    await screen.getByTestId("submit").click();
    expect(mockMutateAsync).toHaveBeenCalledWith({
      orgId: "org-1",
      data: expect.objectContaining({ name: "My Project" }),
    });
  });

  it("navigates to /projects/:id after successful creation", async () => {
    mockMutateAsync.mockResolvedValue({ id: "proj-new" });
    renderPage();
    await screen.getByTestId("submit").click();
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/projects/proj-new");
    });
  });

  it("does not call mutateAsync when currentOrg is null", async () => {
    mockCurrentOrg.mockReturnValue(null);
    mockMutateAsync.mockResolvedValue({ id: "proj-new" });
    renderPage();
    await screen.getByTestId("submit").click();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

describe("NewProject — route access control (App.tsx wiring)", () => {
  function renderWithRouteGuard() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/new"]}>
          <Routes>
            <Route
              path="/projects/new"
              element={
                <ProtectedRoute requireRoles={["owner"]}>
                  <NewProject />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentOrg.mockReturnValue({ id: "org-1", name: "Test Org", slug: "test-org" });
  });

  it("renders NewProject for owner role", () => {
    mockHasRole.mockReturnValue(true);
    renderWithRouteGuard();
    expect(screen.getByTestId("submit")).toBeInTheDocument();
    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it("renders Access Denied for member/viewer role", () => {
    mockHasRole.mockReturnValue(false);
    renderWithRouteGuard();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByTestId("submit")).not.toBeInTheDocument();
  });
});
