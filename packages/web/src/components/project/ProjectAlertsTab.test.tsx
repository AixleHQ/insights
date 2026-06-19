import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectAlertsTab } from "./ProjectAlertsTab";

const PROJECT_ID = "test-project-id";

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProjectAlertsTab projectId={PROJECT_ID} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("ProjectAlertsTab", () => {
  describe("Alert history table", () => {
    it("renders the section heading", () => {
      renderComponent();
      expect(screen.getByText("Alert History")).toBeInTheDocument();
    });

    it("renders placeholder alert rows", () => {
      renderComponent();
      expect(screen.getAllByText("High risk content detected").length).toBeGreaterThan(0);
      expect(screen.getByText("Token threshold exceeded")).toBeInTheDocument();
      expect(screen.getByText("Cost threshold exceeded")).toBeInTheDocument();
    });

    it("renders severity badges", () => {
      renderComponent();
      const badges = screen.getAllByText(/error|warning|critical/i);
      expect(badges.length).toBeGreaterThan(0);
    });

    it("renders triggered-by names (not emails)", () => {
      renderComponent();
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    });
  });

  describe("Search", () => {
    it("filters rows by title", async () => {
      const user = userEvent.setup();
      renderComponent();
      const input = screen.getByRole("textbox", { name: /search alerts/i });
      await user.type(input, "cost");
      expect(screen.getByText("Cost threshold exceeded")).toBeInTheDocument();
      expect(screen.queryByText("Token threshold exceeded")).not.toBeInTheDocument();
    });

    it("filters rows by triggered_by name", async () => {
      const user = userEvent.setup();
      renderComponent();
      const input = screen.getByRole("textbox", { name: /search alerts/i });
      await user.type(input, "Alice");
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
      expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();
    });

    it("shows empty state when no results match", async () => {
      const user = userEvent.setup();
      renderComponent();
      const input = screen.getByRole("textbox", { name: /search alerts/i });
      await user.type(input, "zzznomatch");
      expect(screen.getByText("No alerts found")).toBeInTheDocument();
    });
  });

  describe("Row expand", () => {
    it("shows full message on row click", async () => {
      const user = userEvent.setup();
      renderComponent();
      const row = screen.getAllByRole("row").find((r) =>
        within(r).queryByText("High risk content detected"),
      );
      await user.click(row!);
      expect(screen.getByText("Full context")).toBeInTheDocument();
    });

    it("shows triggering event link when event_id is present", async () => {
      const user = userEvent.setup();
      renderComponent();
      // Alice Johnson's alert has event_id: "evt-001"
      const rows = screen.getAllByRole("row");
      const aliceRow = rows.find((r) => within(r).queryByText("Alice Johnson"));
      await user.click(aliceRow!);
      expect(screen.getByText("View triggering event")).toBeInTheDocument();
    });

    it("hides triggering event link when event_id is absent", async () => {
      const user = userEvent.setup();
      renderComponent();
      // Bob Smith's alert has no event_id
      const rows = screen.getAllByRole("row");
      const bobRow = rows.find((r) => within(r).queryByText("Bob Smith"));
      await user.click(bobRow!);
      expect(screen.queryByText("View triggering event")).not.toBeInTheDocument();
    });
  });

  describe("Sorting", () => {
    it("sorts by severity ascending on header click", async () => {
      const user = userEvent.setup();
      renderComponent();
      const severityHeader = screen.getByRole("columnheader", { name: /severity/i });
      await user.click(severityHeader);
      const rows = screen.getAllByRole("row").slice(1); // skip header
      const firstBadge = within(rows[0]).getByText(/critical|error|warning|info/i);
      expect(firstBadge.textContent).toMatch(/critical/i);
    });
  });
});
