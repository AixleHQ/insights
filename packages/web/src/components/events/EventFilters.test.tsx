import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventFilters, type EventFiltersState } from "./EventFilters";
import { CANONICAL_TOOL_NAMES, type EventsToolFilterOption } from "@/lib/eventsToolFilters";
import { humanizeToolName } from "@/lib/utils";
import { EVENT_TYPES, EVENT_TYPE_META } from "@/lib/event-types";

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

    it("renders the Filters button", () => {
      renderFilters();
      expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    });

    it("does not show active filters section when no filters", () => {
      renderFilters();
      expect(screen.queryByText("Active filters:")).not.toBeInTheDocument();
    });

    it("renders with empty tools array", () => {
      renderFilters({}, []);
      expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    });
  });

  describe("Search Input", () => {
    it("calls onFiltersChange when typing", async () => {
      const user = userEvent.setup();
      renderFilters();

      const searchInput = screen.getByPlaceholderText("Search events...");
      await user.type(searchInput, "a");

      expect(mockOnFiltersChange).toHaveBeenCalled();
      const calls = mockOnFiltersChange.mock.calls;
      expect(calls[calls.length - 1][0]).toHaveProperty("search");
    });

    it("displays the current search value", () => {
      renderFilters({ search: "existing search" });

      const searchInput = screen.getByPlaceholderText("Search events...") as HTMLInputElement;
      expect(searchInput.value).toBe("existing search");
    });

    it("shows clear button when search has value", () => {
      renderFilters({ search: "test" });
      expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
    });

    it("clears search when clear button is clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ search: "test" });

      await user.click(screen.getByRole("button", { name: /clear search/i }));
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined })
      );
    });
  });

  describe("Active Filter Chips", () => {
    it("shows active filters section when tool filter is set", () => {
      renderFilters({ tools: ["claude_code"] });
      expect(screen.getByText("Active filters:")).toBeInTheDocument();
    });

    it("shows tool chip with label and value", () => {
      renderFilters({ tools: ["claude_code"] });
      expect(screen.getByText("Tool:")).toBeInTheDocument();
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    it("groups multiple tools in a single chip", () => {
      renderFilters({ tools: ["claude_code", "cursor"] });
      expect(screen.getByText("Tool:")).toBeInTheDocument();
      expect(screen.getByText("Claude Code, Cursor")).toBeInTheDocument();
    });

    it("shows risk chip with label and value", () => {
      renderFilters({ riskLevels: ["critical"] });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });

    it("groups multiple risk levels in a single chip", () => {
      renderFilters({ riskLevels: ["high", "medium"] });
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      expect(screen.getByText("High, Medium")).toBeInTheDocument();
    });

    it("shows event type chip when type is selected", () => {
      renderFilters({ eventTypes: ["completion"] });
      expect(screen.getByText("Type:")).toBeInTheDocument();
    });

    it("shows date chip when date filter is set", () => {
      renderFilters({ dateFrom: "2024-01-15", dateTo: "2024-01-20" });
      expect(screen.getByText("Date:")).toBeInTheDocument();
    });

    it("shows multiple chips when multiple filter categories active", () => {
      renderFilters({
        tools: ["claude_code"],
        riskLevels: ["high"],
        eventTypes: ["completion"],
      });

      expect(screen.getByText("Tool:")).toBeInTheDocument();
      expect(screen.getByText("Risk:")).toBeInTheDocument();
      expect(screen.getByText("Type:")).toBeInTheDocument();
    });

    it("removes tool filter when chip remove button clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ tools: ["claude_code"] });

      await user.click(screen.getByRole("button", { name: /remove tool filter/i }));
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ tools: undefined })
      );
    });

    it("removes risk filter when chip remove button clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ riskLevels: ["high"] });

      await user.click(screen.getByRole("button", { name: /remove risk filter/i }));
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ riskLevels: undefined })
      );
    });
  });

  describe("User Filter chip", () => {
    it("shows user chip with userName when userId and userName are set", () => {
      renderFilters({ userId: "user-1", userName: "Jane Doe" });
      expect(screen.getByText("User:")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    it("removes user filter when chip remove button clicked", async () => {
      const user = userEvent.setup();
      renderFilters({ userId: "user-1", userName: "Jane Doe" });

      await user.click(screen.getByRole("button", { name: /remove user filter/i }));
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined, userName: undefined })
      );
    });

    it("shows active filters section when only userId is set", () => {
      renderFilters({ userId: "user-1" });
      expect(screen.getByText("Active filters:")).toBeInTheDocument();
      expect(screen.getByText("user-1")).toBeInTheDocument();
    });
  });

  describe("Filter State Management", () => {
    it("preserves other filters when updating search", async () => {
      const user = userEvent.setup();
      renderFilters({ tools: ["claude_code"], riskLevels: ["high"] });

      const searchInput = screen.getByPlaceholderText("Search events...");
      await user.type(searchInput, "x");

      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall.tools).toEqual(["claude_code"]);
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
        expect(screen.getByText(label)).toBeInTheDocument();
        unmount();
      });
    });
  });

  // AIX-627: every canonical tool and every event type must be reachable
  // through the filter UI, so no data source is silently unfilterable.
  describe("Enum coverage guards", () => {
    const openSubmenu = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
      await user.click(screen.getByRole("button", { name: /filters/i }));
      await user.click(await screen.findByRole("menuitem", { name }));
    };

    it("renders a selectable option for every canonical tool", async () => {
      const user = userEvent.setup();
      const canonicalTools: EventsToolFilterOption[] = CANONICAL_TOOL_NAMES.map((value) => ({
        value,
        label: humanizeToolName(value),
      }));
      renderFilters({}, canonicalTools);

      await openSubmenu(user, /^tool$/i);

      for (const tool of canonicalTools) {
        const items = await screen.findAllByRole("menuitemcheckbox", { name: tool.label });
        expect(items.length).toBeGreaterThan(0);
      }
    });

    it("renders a selectable option for every event type", async () => {
      const user = userEvent.setup();
      renderFilters();

      await openSubmenu(user, /^event type$/i);

      for (const type of EVENT_TYPES) {
        const label = EVENT_TYPE_META[type].label;
        const items = await screen.findAllByRole("menuitemcheckbox", { name: label });
        expect(items.length).toBeGreaterThan(0);
      }
    });

    it("covers exactly the 14 backend event types (tripwire on enum drift)", () => {
      // Mirror of ToolEvent::EVENT_TYPES (packages/api/app/models/tool_event.rb).
      const EXPECTED_EVENT_TYPES = [
        "chat",
        "completion",
        "edit",
        "commit",
        "review",
        "test",
        "debug",
        "refactor",
        "documentation",
        "other",
        "issue",
        "comment",
        "sprint",
        "tool_use",
      ];
      expect([...EVENT_TYPES].sort()).toEqual([...EXPECTED_EVENT_TYPES].sort());
    });
  });
});
