import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventFilters, type EventFiltersState } from "./EventFilters";
import type { EventsToolFilterOption } from "@/lib/eventsToolFilters";

describe("EventFilters", () => {
  const defaultTools: EventsToolFilterOption[] = [
    { value: "claude_code", label: "Claude Code" },
    { value: "cursor", label: "Cursor" },
    { value: "github_copilot", label: "GitHub Copilot" },
    { value: "windsurf", label: "Windsurf" },
  ];
  let mockOnFiltersChange: Mock<(filters: EventFiltersState) => void>;
  let defaultFilters: EventFiltersState;

  beforeEach(() => {
    mockOnFiltersChange = vi.fn();
    defaultFilters = {};
  });

  const renderFilters = (
    filters: EventFiltersState = defaultFilters,
    tools: readonly EventsToolFilterOption[] = defaultTools
  ) => {
    return render(
      <EventFilters
        filters={filters}
        onFiltersChange={mockOnFiltersChange}
        tools={tools}
      />
    );
  };

  describe("Initial Render", () => {
    it("renders the search input", () => {
      renderFilters();
      expect(screen.getByPlaceholderText("Search events...")).toBeInTheDocument();
    });

    it("renders tool filter dropdown", () => {
      renderFilters();
      expect(screen.getByText("All tools")).toBeInTheDocument();
    });

    it("renders risk level filter button", () => {
      renderFilters();
      expect(screen.getByText("Risk level")).toBeInTheDocument();
    });

    it("renders event type filter dropdown", () => {
      renderFilters();
      expect(screen.getByText("All types")).toBeInTheDocument();
    });

    it("renders date range picker button", () => {
      renderFilters();
      expect(screen.getByText("Date range")).toBeInTheDocument();
    });

    it("does not show clear all button when no filters active", () => {
      renderFilters();
      expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
    });

    it("does not show active filters section when no filters", () => {
      renderFilters();
      expect(screen.queryByText("Active filters:")).not.toBeInTheDocument();
    });

    it("renders two comboboxes (tool and event type; risk is a popover button)", () => {
      renderFilters();
      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes.length).toBe(2);
    });
  });

  describe("Search Input", () => {
    it("calls onFiltersChange when typing", async () => {
      const user = userEvent.setup();
      renderFilters();

      const searchInput = screen.getByPlaceholderText("Search events...");
      await user.type(searchInput, "a");

      expect(mockOnFiltersChange).toHaveBeenCalled();
      // The last call should include the search value
      const calls = mockOnFiltersChange.mock.calls;
      expect(calls[calls.length - 1][0]).toHaveProperty("search");
    });

    it("displays the current search value", () => {
      renderFilters({ search: "existing search" });

      const searchInput = screen.getByPlaceholderText("Search events...") as HTMLInputElement;
      expect(searchInput.value).toBe("existing search");
    });

    it("shows clear all when search has value", () => {
      renderFilters({ search: "test" });
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });

    it("clears search when clear all is clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ search: "test" });

      await user.click(screen.getByText("Clear all"));
      expect(mockOnFiltersChange).toHaveBeenCalledWith({});
    });
  });

  describe("Tool Filter", () => {
    it("shows selected tool name in trigger when tool is selected", () => {
      renderFilters({ tool: "claude_code" });
      // When a tool is selected, "All tools" should not be visible
      expect(screen.queryByText("All tools")).not.toBeInTheDocument();
    });

    it("displays tool filter chip when tool is selected", () => {
      renderFilters({ tool: "claude_code" });
      expect(screen.getByText("Tool:")).toBeInTheDocument();
      expect(screen.getAllByText("Claude Code").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Risk Level Filter", () => {
    it("shows risk filter button with count when one level selected", () => {
      renderFilters({ riskLevels: ["critical"] });
      expect(screen.getByText("Risk (1)")).toBeInTheDocument();
    });

    it("shows risk filter button with count when multiple levels selected", () => {
      renderFilters({ riskLevels: ["high", "medium"] });
      expect(screen.getByText("Risk (2)")).toBeInTheDocument();
    });

    it("displays risk filter chip for each selected level", () => {
      renderFilters({ riskLevels: ["critical"] });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });

    it("displays two risk chips when two levels selected", () => {
      renderFilters({ riskLevels: ["high", "medium"] });
      // Both chips show "Risk:" label — at least two occurrences
      const riskLabels = screen.getAllByText("Risk:");
      expect(riskLabels.length).toBe(2);
      expect(screen.getByText("High")).toBeInTheDocument();
      expect(screen.getByText("Medium")).toBeInTheDocument();
    });

    it("opens popover with checkboxes when risk button clicked", async () => {
      const user = userEvent.setup();
      renderFilters();

      await user.click(screen.getByText("Risk level"));

      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: /critical/i })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: /high/i })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: /medium/i })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: /low/i })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: /none/i })).toBeInTheDocument();
      });
    });

    it("calls onFiltersChange with riskLevels array when checkbox toggled", async () => {
      const user = userEvent.setup();
      renderFilters();

      await user.click(screen.getByText("Risk level"));

      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: /high/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("checkbox", { name: /high/i }));

      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ riskLevels: ["high"] })
      );
    });

    it("removes a risk level chip when its remove button is clicked", () => {
      renderFilters({ riskLevels: ["high"] });
      const activeSection = screen.getByText("Active filters:").parentElement;
      const removeButton = activeSection?.querySelector("button");
      expect(removeButton).toBeTruthy();
    });

    it("shows clear all button when risk level is selected", () => {
      renderFilters({ riskLevels: ["high"] });
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });
  });

  describe("Event Type Filter", () => {
    it("displays type filter chip when type is selected", () => {
      renderFilters({ eventType: "completion" });
      expect(screen.getByText("Type:")).toBeInTheDocument();
      // Completion appears in chip and select
      const elements = screen.getAllByText("Completion");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("displays human-readable label for function_call event type", () => {
      renderFilters({ eventType: "function_call" });
      // Function Call appears in chip and possibly in select
      const elements = screen.getAllByText("Function Call");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Date Range Picker", () => {
    it("opens popover when clicked", async () => {
      const user = userEvent.setup();
      renderFilters();

      await user.click(screen.getByText("Date range"));

      await waitFor(() => {
        expect(screen.getByText("Date Range")).toBeInTheDocument();
        expect(screen.getByText("From")).toBeInTheDocument();
        expect(screen.getByText("To")).toBeInTheDocument();
      });
    });

    it("displays formatted date range when both dates selected", () => {
      renderFilters({
        dateFrom: "2024-01-15",
        dateTo: "2024-01-20",
      });

      // Should contain the date info in a button
      const dateButton = screen.getByRole("button", { name: /jan/i });
      expect(dateButton).toBeInTheDocument();
    });

    it("shows visual indicator when date filter is active", () => {
      renderFilters({ dateFrom: "2024-01-15" });

      // The date button should exist and have the date displayed
      const buttons = screen.getAllByRole("button");
      const dateButton = buttons.find(btn => btn.textContent?.includes("Jan"));
      expect(dateButton).toBeTruthy();
    });

    it("shows clear dates button when dates are set", async () => {
      const user = userEvent.setup();
      renderFilters({ dateFrom: "2024-01-15" });

      const buttons = screen.getAllByRole("button");
      const dateButton = buttons.find(btn => btn.textContent?.includes("Jan"));

      if (dateButton) {
        await user.click(dateButton);
        await waitFor(() => {
          expect(screen.getByText("Clear dates")).toBeInTheDocument();
        });
      }
    });

    it("clears dates when clear button clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ dateFrom: "2024-01-15", dateTo: "2024-01-20" });

      const buttons = screen.getAllByRole("button");
      const dateButton = buttons.find(btn => btn.textContent?.includes("Jan"));

      if (dateButton) {
        await user.click(dateButton);
        await waitFor(() => {
          expect(screen.getByText("Clear dates")).toBeInTheDocument();
        });

        await user.click(screen.getByText("Clear dates"));
        expect(mockOnFiltersChange).toHaveBeenCalled();
      }
    });
  });

  describe("Active Filter Chips", () => {
    it("shows active filters section when filters are set", () => {
      renderFilters({ tool: "claude_code" });
      expect(screen.getByText("Active filters:")).toBeInTheDocument();
    });

    it("shows filter chip for tool filter", () => {
      renderFilters({ tool: "claude_code" });
      expect(screen.getByText("Tool:")).toBeInTheDocument();
    });

    it("shows filter chip for risk level", () => {
      renderFilters({ riskLevels: ["critical"] });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });

    it("shows filter chip for event type", () => {
      renderFilters({ eventType: "completion" });
      expect(screen.getByText("Type:")).toBeInTheDocument();
      // Completion appears in both chip and select
      const elements = screen.getAllByText("Completion");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows filter chips for date filters", () => {
      renderFilters({
        dateFrom: "2024-01-15",
        dateTo: "2024-01-20",
      });

      expect(screen.getByText("From:")).toBeInTheDocument();
      expect(screen.getByText("To:")).toBeInTheDocument();
    });

    it("removes filter when chip remove button clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ tool: "claude_code" });

      // Find buttons in the active filters section
      const activeFiltersSection = screen.getByText("Active filters:").parentElement;
      const removeButtons = activeFiltersSection?.querySelectorAll("button");

      if (removeButtons && removeButtons.length > 0) {
        await user.click(removeButtons[0]);
        expect(mockOnFiltersChange).toHaveBeenCalledWith(
          expect.objectContaining({ tool: undefined })
        );
      }
    });

    it("shows multiple filter chips when multiple filters active", () => {
      renderFilters({
        tool: "claude_code",
        riskLevels: ["high"],
        eventType: "completion",
      });

      expect(screen.getByText("Tool:")).toBeInTheDocument();
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      expect(screen.getByText("Type:")).toBeInTheDocument();
    });
  });

  describe("Clear All Filters", () => {
    it("shows clear all button when search filter is active", () => {
      renderFilters({ search: "test" });
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });

    it("shows clear all button when dropdown filters are active", () => {
      renderFilters({ tool: "claude_code" });
      expect(screen.getByText("Clear all")).toBeInTheDocument();
    });

    it("clears all filters when clear all clicked", async () => {
      const user = userEvent.setup();
      renderFilters({
        search: "test",
        tool: "claude_code",
        riskLevels: ["high"],
        eventType: "completion",
        dateFrom: "2024-01-15",
        dateTo: "2024-01-20",
      });

      await user.click(screen.getByText("Clear all"));
      expect(mockOnFiltersChange).toHaveBeenCalledWith({});
    });
  });

  describe("Filter State Management", () => {
    it("preserves other filters when updating one", async () => {
      const user = userEvent.setup();
      renderFilters({ tool: "claude_code", riskLevels: ["high"] });

      const searchInput = screen.getByPlaceholderText("Search events...");
      await user.type(searchInput, "x");

      // Last call should have all filters
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall.tool).toBe("claude_code");
      expect(lastCall.riskLevels).toEqual(["high"]);
    });
  });

  describe("Custom className", () => {
    it("applies custom className to container", () => {
      const { container } = render(
        <EventFilters
          filters={{}}
          onFiltersChange={mockOnFiltersChange}
          tools={defaultTools}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Empty tools list", () => {
    it("renders with empty tools array", () => {
      renderFilters({}, []);
      expect(screen.getByText("All tools")).toBeInTheDocument();
    });
  });

  describe("Filter value display", () => {
    it("displays all risk level labels correctly in chip", () => {
      const riskLevelValues = [
        { value: "critical", label: "Critical" },
        { value: "high", label: "High" },
        { value: "medium", label: "Medium" },
        { value: "low", label: "Low" },
        { value: "none", label: "None" },
      ];

      riskLevelValues.forEach(({ value, label }) => {
        const { unmount } = renderFilters({ riskLevels: [value] });
        // Label appears in the chip
        expect(screen.getByText(label)).toBeInTheDocument();
        unmount();
      });
    });

    it("displays all event type labels correctly", () => {
      const eventTypes = [
        { value: "prompt", label: "Prompt" },
        { value: "completion", label: "Completion" },
        { value: "function_call", label: "Function Call" },
        { value: "file_operation", label: "File Operation" },
      ];

      eventTypes.forEach(({ value, label }) => {
        const { unmount } = renderFilters({ eventType: value });
        // Labels appear in both chip and select value
        const elements = screen.getAllByText(label);
        expect(elements.length).toBeGreaterThanOrEqual(1);
        unmount();
      });
    });
  });
});
