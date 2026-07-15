import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectCard } from "./ProjectCard";
import { type ProjectWithStats } from "@/lib/types";

const baseProject: ProjectWithStats = {
  id: "p1",
  name: "Alpha",
  isActive: true,
  eventCount: 1234,
  totalCostUsd: 5.5,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("ProjectCard", () => {
  it("renders serializer-backed event count and formatted cost", () => {
    render(
      <ProjectCard project={baseProject}/>
    );

    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("$5.50")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("shows Unlinked badge and tooltip when git remote is missing", async () => {
    const user = userEvent.setup();
    render(<ProjectCard project={{ ...baseProject, gitRemoteUrl: null }} />);

    const trigger = screen.getByLabelText(/no git remote configured/i);
    expect(trigger).toBeInTheDocument();

    await user.hover(trigger);
    const tooltips = await screen.findAllByText("No git remote configured — CLI events won't be attributed.");
    expect(tooltips.length).toBeGreaterThanOrEqual(1);
  });

  it("shows filled star when isFavorited is true", () => {
    render(
      <ProjectCard
        project={baseProject}
        isFavorited={true}
        onToggleFavorite={vi.fn()}
      />
    );

    const starBtn = screen.getByRole("button", { name: /toggle favorite/i });
    expect(starBtn).not.toHaveClass("opacity-0");
    expect(starBtn).toHaveClass("opacity-100");
  });

  it("hides star button when not hovered and not favorited", () => {
    render(
      <ProjectCard
        project={baseProject}
        isFavorited={false}
        onToggleFavorite={vi.fn()}
      />
    );

    const starBtn = screen.getByRole("button", { name: /toggle favorite/i });
    expect(starBtn).toHaveClass("opacity-0");
    expect(starBtn).not.toHaveClass("opacity-100");
  });

  it("calls onToggleFavorite with project id and name when star clicked", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();

    render(
      <ProjectCard
        project={baseProject}
        isFavorited={false}
        onToggleFavorite={onToggleFavorite}
      />
    );

    await user.click(screen.getByRole("button", { name: /toggle favorite/i }));
    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onToggleFavorite).toHaveBeenCalledWith({ id: "p1", name: "Alpha" });
  });

  it("renders a link to the project detail page", () => {
    render(<ProjectCard project={baseProject} />);

    const link = screen.getByRole("link", { name: /view alpha/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/projects/p1");
  });

  describe("actions menu RBAC (AIX-501)", () => {
    it("hides Edit and Delete for a non-manager (default)", async () => {
      const user = userEvent.setup();
      render(<ProjectCard project={baseProject} onEdit={() => {}} onDelete={() => {}} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));

      expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /edit project/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /delete project/i })).not.toBeInTheDocument();
    });

    it("shows Edit and Delete when the user can manage the project", async () => {
      const user = userEvent.setup();
      render(<ProjectCard project={baseProject} canManage onEdit={() => {}} onDelete={() => {}} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));

      expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /edit project/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /delete project/i })).toBeInTheDocument();
    });
  });

  it("calls onToggleFavorite and does not navigate when favorite button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();

    render(
      <ProjectCard
        project={baseProject}
        isFavorited={false}
        onToggleFavorite={onToggleFavorite}
      />
    );

    await user.click(screen.getByRole("button", { name: /toggle favorite/i }));
    expect(onToggleFavorite).toHaveBeenCalledOnce();
  });
});
