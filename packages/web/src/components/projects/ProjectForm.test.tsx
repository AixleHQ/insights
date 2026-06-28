import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProjectForm } from "./ProjectForm";
import { ApiError } from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderForm(props: Partial<React.ComponentProps<typeof ProjectForm>> = {}) {
  return render(
    <MemoryRouter>
      <ProjectForm onSubmit={vi.fn().mockResolvedValue(undefined)} {...props} />
    </MemoryRouter>
  );
}

describe("ProjectForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create mode (default)", () => {
    it("shows 'New Project' heading and 'Create Project' submit button", () => {
      renderForm();
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create project/i })).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    const initialData = {
      name: "Existing Project",
      description: "A description",
      repository_url: "https://github.com/org/repo",
      git_remote_url: "git@github.com:org/repo.git",
      is_active: true,
    };

    it("shows 'Edit Project' heading and 'Save Changes' submit button", () => {
      renderForm({ isEditing: true, initialData });
      expect(screen.getByRole("heading", { name: /edit project/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });

    it("pre-fills fields from initialData", () => {
      renderForm({ isEditing: true, initialData });
      expect(screen.getByLabelText(/project name/i)).toHaveValue("Existing Project");
      expect(screen.getByLabelText(/description/i)).toHaveValue("A description");
      expect(screen.getByLabelText(/repository url/i)).toHaveValue("https://github.com/org/repo");
    });
  });

  describe("back button and cancel", () => {
    it("back button navigates to /projects", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("button", { name: /back to projects/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/projects");
    });

    it("cancel button navigates to /projects", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/projects");
    });
  });

  describe("validation", () => {
    it("shows error when name is empty", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("button", { name: /create project/i }));
      expect(screen.getByText("Project name is required")).toBeInTheDocument();
    });

    it("shows error when name is less than 2 characters", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(screen.getByLabelText(/project name/i), "A");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
    });

    it("shows error for invalid repository URL", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(screen.getByLabelText(/project name/i), "My Project");
      await user.type(screen.getByLabelText(/repository url/i), "not-a-url");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      expect(screen.getByText(/valid url/i)).toBeInTheDocument();
    });

    it("accepts a valid repository URL", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({ onSubmit });
      await user.type(screen.getByLabelText(/project name/i), "My Project");
      await user.type(screen.getByLabelText(/repository url/i), "https://github.com/org/repo");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(screen.queryByText(/valid url/i)).not.toBeInTheDocument();
    });

    it("shows server-side git_remote_url error from 422 response", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValue(
        new ApiError("Validation error", 422, {
          errors: {
            git_remote_url: [
              'Git remote url is already linked to project "Other Project" in this organization',
            ],
          },
        })
      );
      renderForm({ onSubmit });
      await user.type(screen.getByLabelText(/project name/i), "My Project");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      await waitFor(() =>
        expect(screen.getByText(/already linked to project/i)).toBeInTheDocument()
      );
    });

    it("clears field error when the user types in that field", async () => {
      const user = userEvent.setup();
      renderForm();
      // Trigger name error
      await user.click(screen.getByRole("button", { name: /create project/i }));
      expect(screen.getByText("Project name is required")).toBeInTheDocument();
      // Type to clear it
      await user.type(screen.getByLabelText(/project name/i), "X");
      expect(screen.queryByText("Project name is required")).not.toBeInTheDocument();
    });
  });

  describe("submit behaviour", () => {
    it("calls onSubmit with form data on valid submission", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({ onSubmit });
      await user.type(screen.getByLabelText(/project name/i), "My Project");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ name: "My Project" })
        );
      });
    });

    it("does NOT navigate to /projects after onSubmit resolves (double-nav fix)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({ onSubmit });
      await user.type(screen.getByLabelText(/project name/i), "My Project");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(mockNavigate).not.toHaveBeenCalledWith("/projects");
    });

    it("disables submit button while submitting, re-enables after", async () => {
      const user = userEvent.setup();
      let resolveSubmit!: () => void;
      const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => { resolveSubmit = r; }));
      renderForm({ onSubmit });
      await user.type(screen.getByLabelText(/project name/i), "My Project");
      await user.click(screen.getByRole("button", { name: /create project/i }));
      expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
      resolveSubmit();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /create project/i })).not.toBeDisabled()
      );
    });
  });
});
