import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectSettings } from "./ProjectSettings";
import { ApiError } from "@/lib/api";

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
const mockUseProjectRetentionPolicy = vi.fn();
const mockUseUpdateProjectRetentionPolicy = vi.fn();
const mockUseProjectMembers = vi.fn();
const mockHasRole = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useUpdateProject: () => mockUseUpdateProject(),
  useDeleteProject: () => mockUseDeleteProject(),
  useProjectRetentionPolicy: (...args: unknown[]) => mockUseProjectRetentionPolicy(...args),
  useUpdateProjectRetentionPolicy: () => mockUseUpdateProjectRetentionPolicy(),
  useCurrentUser: () => ({ data: { id: "user-1", email: "test@example.com" }, isLoading: false }),
  useProjectMembers: (...args: unknown[]) => mockUseProjectMembers(...args),
}));

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    currentMembership: { role: "member" },
    isLoading: false,
    hasRole: mockHasRole,
  }),
}));

vi.mock("@/components/project", () => ({
  ProjectSecurityTab: () => <div>Security Tab</div>,
  ProjectSettingsSection: () => <div>Email Domain Section</div>,
  ProjectRetentionPolicySection: () => <div>Retention Policy Section</div>,
  ProjectAlertsSection: () => <div>Alerts Section</div>,
  ProjectMembersTab: () => <div>Members Tab</div>,
  ProjectConnectorsTab: () => <div>Connectors Tab</div>,
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
  repositoryUrl: "https://github.com/org/repo",
  gitRemoteUrl: "git@github.com:org/repo.git",
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

const mockProjectMember = { id: "pm-1", userId: "user-1", role: "owner" as const };

function setupDefaultMocks() {
  mockUseProject.mockReturnValue({
    data: mockProject,
    isLoading: false,
    isFetching: false,
    isFetchedAfterMount: true,
  });
  mockUseUpdateProject.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseDeleteProject.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseProjectRetentionPolicy.mockReturnValue({ data: undefined, isLoading: false });
  mockUseUpdateProjectRetentionPolicy.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  // Default: current user is a project member with owner role; org role is non-owner
  mockUseProjectMembers.mockReturnValue({ data: [mockProjectMember], isLoading: false });
  mockHasRole.mockReturnValue(false);
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

    it("shows Project not found when project is null", () => {
      mockUseProject.mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: true,
      });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByText("Project not found")).toBeInTheDocument();
    });

    it("shows Project not found on 404 even when stale project data remains (AIX-611)", () => {
      mockUseProject.mockReturnValue({
        data: mockProject,
        isLoading: false,
        isFetching: false,
        isFetchedAfterMount: true,
        isError: true,
        error: { message: "Not found", status: 404 },
      });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByText("Project not found")).toBeInTheDocument();
      expect(screen.queryByText(/My Project/)).not.toBeInTheDocument();
    });
  });

  describe("Sidebar navigation", () => {
    it("shows all 6 nav links for a project owner", () => {
      mockHasRole.mockReturnValue(true);
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("link", { name: /general/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /^members$/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /^integrations$/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /security & audit/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /policies/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /alerts/i })).toBeInTheDocument();
    });

    it("redirects a project member who is not an owner (no nav)", () => {
      mockHasRole.mockReturnValue(false);
      mockUseProjectMembers.mockReturnValue({ data: [{ id: "pm-1", userId: "user-1", role: "member" }] });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByRole("link", { name: /^members$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^integrations$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /general/i })).not.toBeInTheDocument();
    });

    it("redirects a non-member (no nav)", () => {
      mockHasRole.mockReturnValue(false);
      mockUseProjectMembers.mockReturnValue({ data: [] });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByRole("link", { name: /^members$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^integrations$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /general/i })).not.toBeInTheDocument();
    });

    it("marks General as active on the index route", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByRole("link", { name: /general/i }).className).toMatch(/text-primary/);
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

    it("shows the server's validation message when delete is blocked by dependent records", async () => {
      mockUseDeleteProject.mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(
          new ApiError("Validation error", 422, {
            error: "Unprocessable Entity",
            errors: { base: [ "Cannot delete record because dependent tool events exist" ] },
          })
        ),
        isPending: false,
      });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderAtPath("/projects/proj-1/settings");

      await user.click(screen.getByRole("button", { name: /delete project/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Cannot delete record because dependent tool events exist")
        ).toBeInTheDocument();
      });
    });

    it("shows git remote attribution warning when git remote is missing", () => {
      mockUseProject.mockReturnValue({
        data: {
          ...mockProject,
          gitRemoteUrl: null,
        },
        isLoading: false,
      });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByText(/CLI events cannot be auto-attributed yet/i)).toBeInTheDocument();
    });

    it("does not show git remote warning when remote is configured", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByText(/CLI events cannot be auto-attributed yet/i)).not.toBeInTheDocument();
    });

    it("uses Git remote URL (for auto CLI attribution) field label", () => {
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByLabelText(/Git remote URL \(for auto CLI attribution\)/i)).toBeInTheDocument();
    });
  });

  describe("Owner-only access guard (AIX-501)", () => {
    function setupViewer() {
      mockHasRole.mockReturnValue(false);
      mockUseProjectMembers.mockReturnValue({ data: [{ id: "pm-1", userId: "user-1", role: "viewer" }] });
    }

    it("redirects a viewer away from the Settings page (no General form)", () => {
      setupViewer();
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete project/i })).not.toBeInTheDocument();
    });

    it("redirects a plain project member who is not an owner", () => {
      mockHasRole.mockReturnValue(false);
      mockUseProjectMembers.mockReturnValue({ data: [{ id: "pm-1", userId: "user-1", role: "member" }] });
      renderAtPath("/projects/proj-1/settings");

      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });

    it("renders the full Settings page for a project owner", () => {
      mockHasRole.mockReturnValue(true);
      renderAtPath("/projects/proj-1/settings");

      expect(screen.getByLabelText("Name")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete project/i })).toBeInTheDocument();
    });
  });

  describe("Sub-routes", () => {
    it("renders Members tab at /settings/members for a project owner", () => {
      mockHasRole.mockReturnValue(true);
      renderAtPath("/projects/proj-1/settings/members");

      expect(screen.getByText("Members Tab")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /members/i })).toBeInTheDocument();
    });

    it("redirects /settings/members to General for a non-member", () => {
      mockHasRole.mockReturnValue(false);
      mockUseProjectMembers.mockReturnValue({ data: [] });
      renderAtPath("/projects/proj-1/settings/members");

      expect(screen.queryByText("Members Tab")).not.toBeInTheDocument();
    });

    it("renders Integrations tab at /settings/integrations for a project owner", () => {
      mockHasRole.mockReturnValue(true);
      renderAtPath("/projects/proj-1/settings/integrations");

      expect(screen.getByText("Connectors Tab")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /integrations/i })).toBeInTheDocument();
    });

    it("redirects /settings/integrations to General for a non-owner", () => {
      mockHasRole.mockReturnValue(false);
      mockUseProjectMembers.mockReturnValue({ data: [{ id: "pm-1", userId: "user-1", role: "member" }] });
      renderAtPath("/projects/proj-1/settings/integrations");

      expect(screen.queryByText("Connectors Tab")).not.toBeInTheDocument();
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
