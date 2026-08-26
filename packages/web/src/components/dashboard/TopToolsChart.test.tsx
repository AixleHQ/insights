import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { TopToolsChart } from "./TopToolsChart";

describe("TopToolsChart", () => {
  it("falls back to the legacy copy when no projects list is supplied", () => {
    render(<TopToolsChart data={[]} />);
    expect(screen.getByText("Most used tools by event count")).toBeInTheDocument();
  });

  it("shows the org-wide scope label when no project is selected", () => {
    render(<TopToolsChart data={[]} projects={[{ id: "p1", name: "Aixle Insights" }]} />);
    expect(screen.getByText("Top tools across your organization")).toBeInTheDocument();
  });

  it("shows the selected project's name combined with the period", () => {
    render(
      <TopToolsChart
        data={[]}
        projectId="p1"
        projects={[{ id: "p1", name: "Aixle Insights" }]}
        periodDesc="July 2026"
      />
    );
    expect(screen.getByText("Top tools for Aixle Insights · July 2026")).toBeInTheDocument();
  });
});
