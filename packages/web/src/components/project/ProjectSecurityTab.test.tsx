import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectSecurityTab } from "./ProjectSecurityTab";
import type { ProjectAuditLog } from "@/lib/types";

const mockUseProjectAuditLogs = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProjectAuditLogs: (...args: unknown[]) => mockUseProjectAuditLogs(...args),
}));

const PROJECT_ID = "test-project-id";

function makelog(overrides: Partial<ProjectAuditLog> = {}): ProjectAuditLog {
  return {
    id: crypto.randomUUID(),
    action: "settings.update",
    resourceType: "ProjectSetting",
    resourceId: "resource-abc-12345678",
    trackedChanges: {},
    metadata: {},
    ipAddress: "192.168.1.1",
    createdAt: "2026-03-20T10:30:00Z",
    actor: { id: "user-1", email: "alice@example.com", name: "Alice Smith" },
    ...overrides,
  };
}

const singlePageMeta = { current_page: 1, total_pages: 1, total_count: 2, per_page: 20 };
const multiPageMeta = { current_page: 1, total_pages: 3, total_count: 50, per_page: 20 };

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProjectSecurityTab projectId={PROJECT_ID} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("ProjectSecurityTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading state", () => {
    it("shows skeleton loaders while fetching", () => {
      mockUseProjectAuditLogs.mockReturnValue({ data: undefined, isLoading: true });
      renderComponent();

      expect(screen.getByText("Security & Audit Log")).toBeInTheDocument();
      expect(screen.getByText("Filters")).toBeInTheDocument();
      // Skeletons are rendered (no table, no empty state)
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByText("No audit log entries found")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no audit logs exist", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [], meta: { current_page: 1, total_pages: 0, total_count: 0, per_page: 20 } },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("No audit log entries found")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("Table rendering", () => {
    it("renders table headers", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Actor" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Action" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Target" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "IP" })).toBeInTheDocument();
    });

    it("displays actor name and email", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    it("displays actor email as name when actor has no name", () => {
      const log = makelog({ actor: { id: "user-2", email: "bob@example.com", name: null } });
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [log], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });

    it("displays System when actor is null", () => {
      const log = makelog({ actor: null });
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [log], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("displays human-readable action label", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ action: "connector.create" })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("Connector Created")).toBeInTheDocument();
    });

    it("falls back to raw action string for unknown actions", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ action: "custom.unknown" })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("custom.unknown")).toBeInTheDocument();
    });

    it("displays resource type and truncated resource ID", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ resourceType: "ProjectConnector", resourceId: "abcdef12-3456-7890" })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("ProjectConnector")).toBeInTheDocument();
      expect(screen.getByText("#abcdef12")).toBeInTheDocument();
    });

    it("displays dash when resource type is null", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ resourceType: null, resourceId: null })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("displays IP address", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ ipAddress: "10.0.0.1" })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    });

    it("displays dash when IP address is null", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ ipAddress: null })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      // The IP dash is an em-dash character
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  describe("Impersonation events", () => {
    it("renders impersonation action with destructive badge", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ action: "impersonation.started" })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      const badge = screen.getByText("Impersonation Started");
      expect(badge.className).toMatch(/bg-destructive/);
    });

    it("renders non-impersonation action without destructive badge variant", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog({ action: "member.invited" })], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      const badge = screen.getByText("Member Invited");
      expect(badge.className).toMatch(/bg-secondary/);
      expect(badge.className).not.toMatch(/bg-destructive/);
    });

    it("displays impersonator email from metadata", () => {
      const log = makelog({
        action: "impersonation.started",
        metadata: { impersonator_email: "admin@example.com" },
      });
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [log], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("by admin@example.com")).toBeInTheDocument();
    });

    it("does not display impersonator line when metadata is missing", () => {
      const log = makelog({ action: "impersonation.started", metadata: {} });
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [log], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("Impersonation Started")).toBeInTheDocument();
      expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
    });
  });

  describe("Filters", () => {
    it("calls hook with default filters on initial render", () => {
      mockUseProjectAuditLogs.mockReturnValue({ data: undefined, isLoading: true });
      renderComponent();

      expect(mockUseProjectAuditLogs).toHaveBeenCalledWith(PROJECT_ID, {
        page: 1,
        per_page: 20,
      });
    });

    it("renders action filter select dropdown", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      // Radix Select renders a combobox role
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("applies date filters when Apply is clicked", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [], meta: singlePageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      await user.type(screen.getByLabelText("From"), "2026-03-01");
      await user.type(screen.getByLabelText("To"), "2026-03-20");
      await user.click(screen.getByRole("button", { name: /apply/i }));

      await waitFor(() => {
        expect(mockUseProjectAuditLogs).toHaveBeenCalledWith(PROJECT_ID, {
          page: 1,
          per_page: 20,
          from_date: "2026-03-01",
          to_date: "2026-03-20",
        });
      });
    });

    it("shows Clear button only when filters are active", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [], meta: singlePageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      // Initially no Clear button
      expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();

      // Apply a date filter
      await user.type(screen.getByLabelText("From"), "2026-03-01");
      await user.click(screen.getByRole("button", { name: /apply/i }));

      // Clear button appears
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
      });
    });

    it("clears all filters when Clear is clicked", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [], meta: singlePageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      // Apply a filter first
      await user.type(screen.getByLabelText("From"), "2026-03-01");
      await user.click(screen.getByRole("button", { name: /apply/i }));

      // Click Clear
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /clear/i }));

      // Should reset to default filters
      await waitFor(() => {
        expect(mockUseProjectAuditLogs).toHaveBeenLastCalledWith(PROJECT_ID, {
          page: 1,
          per_page: 20,
        });
      });

      // Clear button should disappear
      expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
    });
  });

  describe("Pagination", () => {
    it("does not show pagination for single page results", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: singlePageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
    });

    it("shows pagination info and buttons for multi-page results", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: multiPageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByText("Page 1 of 3 (50 entries)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });

    it("disables Previous button on first page", () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: multiPageMeta },
        isLoading: false,
      });
      renderComponent();

      expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
    });

    it("disables Next button on last page", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: multiPageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      // Navigate to page 3 (last page) by clicking Next twice
      await user.click(screen.getByRole("button", { name: /next/i }));
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: { ...multiPageMeta, current_page: 2 } },
        isLoading: false,
      });
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
      });
      expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
    });

    it("navigates to next page when Next is clicked", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: multiPageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(mockUseProjectAuditLogs).toHaveBeenCalledWith(PROJECT_ID, {
          page: 2,
          per_page: 20,
        });
      });
    });

    it("navigates back when Previous is clicked after going to page 2", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: multiPageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      // Go to page 2
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Update mock to reflect page 2 meta
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: { ...multiPageMeta, current_page: 2 } },
        isLoading: false,
      });

      // Go back to page 1
      await user.click(screen.getByRole("button", { name: /previous/i }));

      await waitFor(() => {
        expect(mockUseProjectAuditLogs).toHaveBeenCalledWith(PROJECT_ID, {
          page: 1,
          per_page: 20,
        });
      });
    });

    it("resets to page 1 when filters are applied", async () => {
      mockUseProjectAuditLogs.mockReturnValue({
        data: { data: [makelog()], meta: multiPageMeta },
        isLoading: false,
      });
      const user = userEvent.setup();
      renderComponent();

      // Go to page 2
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Apply a filter
      await user.type(screen.getByLabelText("From"), "2026-03-01");
      await user.click(screen.getByRole("button", { name: /apply/i }));

      // Should reset to page 1
      await waitFor(() => {
        expect(mockUseProjectAuditLogs).toHaveBeenCalledWith(PROJECT_ID, {
          page: 1,
          per_page: 20,
          from_date: "2026-03-01",
        });
      });
    });
  });
});
