import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectSettings } from "./ProjectSettings";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "proj-1" }),
    useNavigate: () => mockNavigate,
  };
});

const mockUseProject = vi.fn();
const mockUseUpdateProject = vi.fn();
const mockUseDeleteProject = vi.fn();
const mockUseProjectMembers = vi.fn();
const mockUseProjectRetentionPolicy = vi.fn();
const mockUseUpdateProjectRetentionPolicy = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useUpdateProject: () => mockUseUpdateProject(),
  useDeleteProject: () => mockUseDeleteProject(),
  useProjectMembers: (...args: unknown[]) => mockUseProjectMembers(...args),
  useProjectCommitStats: () => ({ data: undefined, isLoading: false }),
  useProjectRetentionPolicy: (...args: unknown[]) => mockUseProjectRetentionPolicy(...args),
  useUpdateProjectRetentionPolicy: () => mockUseUpdateProjectRetentionPolicy(),
  useCurrentUser: () => ({ data: { id: "user-1", email: "test@example.com" }, isLoading: false }),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    currentMembership: { role: "member" },
    isLoading: false,
  }),
}));

vi.mock("@/components/project", () => ({
  ProjectTeamSection: () => <div>Team Section</div>,
  ProjectConnectorsTab: () => <div>Connectors Tab</div>,
  ProjectSecurityTab: () => <div>Security Tab</div>,
  ProjectSettingsSection: () => <div>Email Domain Section</div>,
  ProjectRetentionPolicySection: () => <div>Retention Policy Section</div>,
  ProjectAlertsSection: () => <div>Alerts Section</div>,
  ProjectNotFound: () => (
    <div>
      <p>Project not found</p>
      <a href="/projects">Back to projects</a>
    </div>
  ),
}));

const mockProject = {
  id: "proj-1",
  name: "My Project",
  description: "A test project",
  repository_url: "https://github.com/org/repo",
  repositoryUrl: "https://github.com/org/repo",
  is_active: true,
  isActive: true,
};

function renderAtPath(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/:id/settings/*" element={<ProjectSettings />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setupDefaultMocks() {
  mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
  mockUseUpdateProject.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseDeleteProject.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseProjectMembers.mockReturnValue({ data: [], isLoading: false });
  mockUseProjectRetentionPolicy.mockReturnValue({ data: undefined, isLoading: false });
  mockUseUpdateProjectRetentionPolicy.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
}

describe("ProjectSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe("Header", () => {
    it("does not show project name while loading", () => {
      mockUseProject.mockReturnValue({ data: undefined, isLoading: true });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByText(/My Project/)).not.toBeInTheDocument();
    });

    it("shows project name in the header", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("heading", { name: "My Project — Settings" })).toBeInTheDocument();
    });

    it('shows "Settings" fallback in header when project is null', () => {
      mockUseProject.mockReturnValue({ data: null, isLoading: false });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });
  });

  describe("Sidebar navigation", () => {
    it("renders all 5 nav links", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("link", { name: /general/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /integrations/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /security & audit/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /policies/i })).toBeInTheDocument();
    });

    it("marks General as active on the index route", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("link", { name: /general/i }).className).toMatch(/text-primary/);
    });

    it("marks Members as active on the members route", () => {
      renderAtPath("/projects/proj-1/settings/members");

      expect(screen.getByRole("link", { name: /members/i }).className).toMatch(/text-primary/);
    });
  });

  describe("General settings (index route)", () => {
    it("shows no form fields while project is loading", () => {
      mockUseProject.mockReturnValue({ data: undefined, isLoading: true });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });

    it("shows not found state when project is null", () => {
      mockUseProject.mockReturnValue({ data: null, isLoading: false });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByText("Project not found")).toBeInTheDocument();
      expect(screen.getByText("Back to projects")).toBeInTheDocument();
    });

    it("renders form pre-filled with project data", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByLabelText("Name")).toHaveValue("My Project");
      expect(screen.getByLabelText("Description")).toHaveValue("A test project");
      expect(screen.getByLabelText("Repository URL")).toHaveValue("https://github.com/org/repo");
    });

    it("renders Email Domain section", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByText("Email Domain Section")).toBeInTheDocument();
    });

    it("Save button is disabled when form has no changes", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
    });

    it("Save button enables after a field change", async () => {
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed");

      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    });

    it("calls updateProject with updated data when Save is clicked", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      mockUseUpdateProject.mockReturnValue({ mutateAsync, isPending: false });
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed Project");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          id: "proj-1",
          data: expect.objectContaining({ name: "Renamed Project" }),
        });
      });
    });

    it("calls deleteProject and navigates to /projects when Delete is confirmed", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      mockUseDeleteProject.mockReturnValue({ mutateAsync, isPending: false });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.click(screen.getByRole("button", { name: /delete project/i }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith("proj-1");
        expect(mockNavigate).toHaveBeenCalledWith("/projects");
      });
    });

    it("does not call deleteProject when Delete is cancelled", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      mockUseDeleteProject.mockReturnValue({ mutateAsync, isPending: false });
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.click(screen.getByRole("button", { name: /delete project/i }));

      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("shows inline error alert when save fails", async () => {
      mockUseUpdateProject.mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(new Error("Network error")),
        isPending: false,
      });
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to save changes. Please try again.")).toBeInTheDocument();
      });
    });

    it("shows inline error alert when delete fails", async () => {
      mockUseDeleteProject.mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(new Error("Network error")),
        isPending: false,
      });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.click(screen.getByRole("button", { name: /delete project/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to delete project. Please try again.")).toBeInTheDocument();
      });
    });
  });

  describe("Sub-routes", () => {
    it("renders Members section at /settings/members", () => {
      renderAtPath("/projects/proj-1/settings/members");

      expect(screen.getByText("Team Section")).toBeInTheDocument();
    });

    it("renders Integrations section at /settings/integrations", () => {
      renderAtPath("/projects/proj-1/settings/integrations");

      expect(screen.getByText("Connectors Tab")).toBeInTheDocument();
    });

    it("renders Security & Audit section at /settings/security", () => {
      renderAtPath("/projects/proj-1/settings/security");

      expect(screen.getByText("Security Tab")).toBeInTheDocument();
    });

    it("renders Policies section at /settings/policies", () => {
      renderAtPath("/projects/proj-1/settings/policies");

      expect(screen.getByText("Retention Policy Section")).toBeInTheDocument();
    });
  });
});
