import { describe, it, expect } from "vitest";
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
      <ProjectCard project={baseProject}/>,
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
    expect(screen.getByText("Unlinked")).toBeInTheDocument();

    await user.hover(trigger);
    const tooltips = await screen.findAllByText("No git remote configured — CLI events won't be attributed.");
    expect(tooltips.length).toBeGreaterThanOrEqual(1);
  });
});
