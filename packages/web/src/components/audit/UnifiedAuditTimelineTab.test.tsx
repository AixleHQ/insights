import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UnifiedAuditTimelineTab } from "./UnifiedAuditTimelineTab";
import type { UnifiedAuditLog, UnifiedPaginatedMeta } from "@/lib/types";

beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const mockUseUnifiedAuditLogs = vi.fn();
const mockExportLogs = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useUnifiedAuditLogs: (...args: unknown[]) => mockUseUnifiedAuditLogs(...args),
  useExportUnifiedAuditLogs: () => ({ exportLogs: mockExportLogs, isExporting: false }),
}));

const makeLog = (overrides: Partial<UnifiedAuditLog> = {}): UnifiedAuditLog => ({
  id: `log-${Math.random()}`,
  action: "settings.update",
  scope: "organization",
  severity: "info",
  outcome: "success",
  resourceType: "Organization",
  resourceId: "res-1",
  metadata: {},
  ipAddress: "127.0.0.1",
  createdAt: new Date().toISOString(),
  actor: { id: "user-1", email: "user@example.com", name: "User" },
  ...overrides,
});

const emptyMeta: UnifiedPaginatedMeta = {
  current_page: 1,
  total_pages: 1,
  total_count: 0,
  per_page: 20,
  truncated: false,
};

function renderTab(orgId = "org-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UnifiedAuditTimelineTab orgId={orgId} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("UnifiedAuditTimelineTab", () => {
  it("shows empty state when no logs", () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [], meta: emptyMeta },
      isLoading: false,
    });
    renderTab();
    expect(screen.getByText("No audit log entries found")).toBeInTheDocument();
  });

  it("renders log rows in the table", () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [makeLog({ action: "connector.create" })], meta: emptyMeta },
      isLoading: false,
    });
    renderTab();
    expect(screen.getByText("Connector Created")).toBeInTheDocument();
  });

  it("shows truncation warning when meta.truncated is true", () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [], meta: { ...emptyMeta, truncated: true } },
      isLoading: false,
    });
    renderTab();
    expect(
      screen.getByText(/capped at 1,000 entries per source/i)
    ).toBeInTheDocument();
  });

  it("does not show truncation warning when meta.truncated is false", () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [], meta: emptyMeta },
      isLoading: false,
    });
    renderTab();
    expect(screen.queryByText(/capped at 1,000 entries/i)).not.toBeInTheDocument();
  });

  it("calls exportLogs with current active filters when export button clicked", async () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [], meta: emptyMeta },
      isLoading: false,
    });
    renderTab();
    const exportBtn = screen.getByRole("button", { name: /export csv/i });
    await userEvent.click(exportBtn);
    expect(mockExportLogs).toHaveBeenCalledWith({});
  });

  it("resets page to 1 when severity pill is clicked", async () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [], meta: emptyMeta },
      isLoading: false,
    });
    renderTab();
    const warningBtn = screen.getByRole("button", { name: /^warning$/i });
    await userEvent.click(warningBtn);
    await waitFor(() => {
      const [[, filters]] = mockUseUnifiedAuditLogs.mock.calls.slice(-1);
      expect(filters.severity).toBe("warning");
      expect(filters.page).toBe(1);
    });
  });

  it("resets page to 1 when outcome pill is clicked", async () => {
    mockUseUnifiedAuditLogs.mockReturnValue({
      data: { data: [], meta: emptyMeta },
      isLoading: false,
    });
    renderTab();
    const failureBtn = screen.getByRole("button", { name: /^failure$/i });
    await userEvent.click(failureBtn);
    await waitFor(() => {
      const [[, filters]] = mockUseUnifiedAuditLogs.mock.calls.slice(-1);
      expect(filters.outcome).toBe("failure");
      expect(filters.page).toBe(1);
    });
  });
});
