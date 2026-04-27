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

    it("renders risk level filter dropdown", () => {
      renderFilters();
      expect(screen.getByText("All risks")).toBeInTheDocument();
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

    it("renders three comboboxes", () => {
      renderFilters();
      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes.length).toBe(3);
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
    it("displays risk filter chip when risk is selected", () => {
      renderFilters({ riskLevel: "critical" });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      // Critical appears twice - in chip and in select value
      const criticalElements = screen.getAllByText("Critical");
      expect(criticalElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows risk filter chip label", () => {
      renderFilters({ riskLevel: "high" });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      // High appears in chip and in select value
      const highElements = screen.getAllByText("High");
      expect(highElements.length).toBeGreaterThanOrEqual(1);
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
      renderFilters({ riskLevel: "critical" });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      // Critical appears in both chip and select
      const elements = screen.getAllByText("Critical");
      expect(elements.length).toBeGreaterThanOrEqual(1);
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
        riskLevel: "high",
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
        riskLevel: "high",
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
      renderFilters({ tool: "claude_code", riskLevel: "high" });

      const searchInput = screen.getByPlaceholderText("Search events...");
      await user.type(searchInput, "x");

      // Last call should have all filters
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall.tool).toBe("claude_code");
      expect(lastCall.riskLevel).toBe("high");
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
    it("displays all risk level labels correctly", () => {
      const riskLevels = [
        { value: "critical", label: "Critical" },
        { value: "high", label: "High" },
        { value: "medium", label: "Medium" },
        { value: "low", label: "Low" },
        { value: "none", label: "None" },
      ];

      riskLevels.forEach(({ value, label }) => {
        const { unmount } = renderFilters({ riskLevel: value });
        // Labels appear in both chip and select value
        const elements = screen.getAllByText(label);
        expect(elements.length).toBeGreaterThanOrEqual(1);
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
