import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditLogDrawer } from "./AuditLogDrawer";
import type { UnifiedAuditLog } from "@/lib/types";

beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const baseLog: UnifiedAuditLog = {
  id: "log-1",
  action: "settings.update",
  scope: "organization",
  severity: "info",
  outcome: "success",
  resourceType: "Organization",
  resourceId: "res-abcdef12",
  metadata: { key: "value" },
  trackedChanges: { name: ["old", "new"] },
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0",
  createdAt: "2026-01-15T10:30:00Z",
  actor: { id: "user-1", email: "admin@example.com", name: "Admin User" },
};

function renderDrawer(
  overrides: Partial<UnifiedAuditLog> = {},
  onNavigate?: (dir: "prev" | "next") => void
) {
  const log = { ...baseLog, ...overrides };
  return render(
    <AuditLogDrawer
      log={log}
      open={true}
      onOpenChange={vi.fn()}
      onNavigate={onNavigate}
      hasPrev={true}
      hasNext={true}
    />
  );
}

describe("AuditLogDrawer", () => {
  it("renders the action label in the header", () => {
    renderDrawer();
    expect(screen.getByText("Settings Updated")).toBeInTheDocument();
  });

  it("renders a scope badge", () => {
    renderDrawer();
    // "organization" appears in the header badge and in the Details section
    const matches = screen.getAllByText("organization");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders severity badge with info text", () => {
    renderDrawer({ severity: "info" });
    expect(screen.getByText("info")).toBeInTheDocument();
  });

  it("renders severity badge with warning text", () => {
    renderDrawer({ severity: "warning" });
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("renders severity badge with critical text", () => {
    renderDrawer({ severity: "critical" });
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("renders success outcome badge", () => {
    renderDrawer({ outcome: "success" });
    expect(screen.getByText("success")).toBeInTheDocument();
  });

  it("renders failure outcome badge", () => {
    renderDrawer({ outcome: "failure" });
    expect(screen.getByText("failure")).toBeInTheDocument();
  });

  it("renders actor name and email", () => {
    renderDrawer();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
  });

  it("renders System when actor is null", () => {
    renderDrawer({ actor: null });
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("renders IP address", () => {
    renderDrawer();
    expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
  });

  it("renders — for absent IP address", () => {
    renderDrawer({ ipAddress: null });
    // At least one dash should appear for the absent field
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders — for absent user agent", () => {
    renderDrawer({ userAgent: null });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders metadata JSON section", () => {
    renderDrawer();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText(/"key"/)).toBeInTheDocument();
  });

  it("renders tracked changes section when present", () => {
    renderDrawer({ trackedChanges: { name: ["old", "new"] } });
    expect(screen.getByText("Tracked Changes")).toBeInTheDocument();
  });

  it("hides tracked changes section when absent", () => {
    renderDrawer({ trackedChanges: undefined });
    expect(screen.queryByText("Tracked Changes")).not.toBeInTheDocument();
  });

  it("hides tracked changes section when empty object", () => {
    renderDrawer({ trackedChanges: {} });
    expect(screen.queryByText("Tracked Changes")).not.toBeInTheDocument();
  });

  it("calls onNavigate with prev when previous button is clicked", async () => {
    const onNavigate = vi.fn();
    renderDrawer({}, onNavigate);
    const prevBtn = screen.getByRole("button", { name: /previous entry/i });
    await userEvent.click(prevBtn);
    expect(onNavigate).toHaveBeenCalledWith("prev");
  });

  it("calls onNavigate with next when next button is clicked", async () => {
    const onNavigate = vi.fn();
    renderDrawer({}, onNavigate);
    const nextBtn = screen.getByRole("button", { name: /next entry/i });
    await userEvent.click(nextBtn);
    expect(onNavigate).toHaveBeenCalledWith("next");
  });

  it("uses admin scope label for admin entries", () => {
    renderDrawer({ scope: "admin", action: "impersonate" });
    expect(screen.getByText("Admin: Impersonation")).toBeInTheDocument();
  });
});
