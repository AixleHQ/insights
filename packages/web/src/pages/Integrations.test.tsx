import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { Integrations } from "./Integrations";
import { useConnectors, useConnectorHealth, useToolAccounts } from "../hooks/useApi";
import type { ConnectorHealthSummary } from "@/lib/types";
import { SHOW_INTEGRATION_CATALOG } from "@/lib/featureFlags";
import { AppRoutes } from "@/lib/routes";

const mockHasRole = vi.fn(() => true);

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
    hasRole: mockHasRole,
  }),
}));

const mockMutateAsync = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useConnectors: vi.fn(() => ({ data: [], isLoading: false })),
  useConnectorHealth: vi.fn(() => ({ data: undefined })),
  useSyncConnector: () => ({ mutateAsync: mockMutateAsync }),
  useDeleteConnector: () => ({ mutateAsync: mockMutateAsync }),
  useTestConnector: () => ({ mutateAsync: mockMutateAsync }),
  useUpdateConnector: () => ({ mutateAsync: mockMutateAsync }),
  useConnectWithApiKey: () => ({ mutateAsync: mockMutateAsync }),
  useConnectSlack: () => ({ mutateAsync: mockMutateAsync }),
  useToolAccounts: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateToolAccount: () => ({ mutateAsync: mockMutateAsync }),
  useDeleteToolAccount: () => ({ mutateAsync: mockMutateAsync }),
  useRegenerateIngestToken: () => ({ mutateAsync: mockMutateAsync }),
}));

vi.mock("@/components/integrations/OrgSlackConnectSheet", () => ({
  OrgSlackConnectSheet: ({ onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) => (
    <button onClick={onSuccess}>slack-connect-success</button>
  ),
}));

vi.mock("@/components/integrations/ApiKeyConnectSheet", () => ({
  ApiKeyConnectSheet: ({ onSuccess }: { provider: unknown; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) => (
    <button onClick={onSuccess}>api-key-connect-success</button>
  ),
}));

const mockConnector = {
  id: "conn-1",
  connectorType: "gitlab",
  status: "connected" as const,
  externalAccountName: "my-org",
  lastSyncAt: null,
  lastError: null,
  repositoryCount: 4,
  syncedEventCount: 12,
  lastEventAt: "2026-04-28T10:00:00Z",
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/integrations/:status" element={<Integrations />} />
        <Route path="/integrations/new/:provider" element={<div>setup page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRole.mockReturnValue(true);
    vi.mocked(useConnectors).mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useConnectors>);
    vi.mocked(useToolAccounts).mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useToolAccounts>);
  });

  describe("URL → active tab", () => {
    it("shows Connected tab as active when path is /integrations/connected", () => {
      renderAt("/integrations/connected");
      expect(screen.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /available/i })).toHaveAttribute("aria-selected", "false");
    });

    it("shows Available tab as active when path is /integrations/available", () => {
      renderAt("/integrations/available");
      expect(screen.getByRole("tab", { name: /available/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "false");
    });

    it("falls back to Connected tab for an unknown status", () => {
      renderAt("/integrations/unknown");
      expect(screen.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Tab click → URL navigation", () => {
    it("navigates to /integrations/available when Available tab is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={["/integrations/connected"]}>
          <Routes>
            <Route path="/integrations/:status" element={<Integrations />} />
          </Routes>
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("tab", { name: /available/i }));
      expect(screen.getByRole("tab", { name: /available/i })).toHaveAttribute("aria-selected", "true");
    });

    it("navigates to /integrations/connected when Connected tab is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={["/integrations/available"]}>
          <Routes>
            <Route path="/integrations/:status" element={<Integrations />} />
          </Routes>
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("tab", { name: /connected/i }));
      expect(screen.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Connect success → redirect to connected", () => {
    it("activates Connected tab after ApiKeyConnectSheet onSuccess fires", async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={["/integrations/available"]}>
          <Routes>
            <Route path="/integrations/:status" element={<Integrations />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByRole("tab", { name: /available/i })).toHaveAttribute("aria-selected", "true");

      await user.click(screen.getByText("api-key-connect-success"));

      expect(screen.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Connected tab content", () => {
    it("shows empty state when there are no integrations", () => {
      renderAt("/integrations/connected");
      expect(screen.getByText("No integrations configured")).toBeInTheDocument();
      expect(screen.getByText("Connect a service to get started")).toBeInTheDocument();
    });

    it("renders an integration card for each connected connector", () => {
      vi.mocked(useConnectors).mockReturnValue({
        data: [mockConnector],
        isLoading: false,
      } as ReturnType<typeof useConnectors>);

      renderAt("/integrations/connected");
      expect(screen.getByText("my-org")).toBeInTheDocument();
      expect(screen.getByText(/4 resources/i)).toBeInTheDocument();
      expect(screen.getByText(/12 synced events/i)).toBeInTheDocument();
    });

    it("calls useUpdateConnector when rename is confirmed", async () => {
      const user = userEvent.setup();
      vi.mocked(useConnectors).mockReturnValue({
        data: [mockConnector],
        isLoading: false,
      } as ReturnType<typeof useConnectors>);

      renderAt("/integrations/connected");

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /rename/i }));
      await user.clear(screen.getByLabelText(/label/i));
      await user.type(screen.getByLabelText(/label/i), "Renamed");
      await user.click(screen.getByRole("button", { name: /save/i }));

      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ data: { label: "Renamed" } }),
      );
    });

    it("shows rename error and keeps dialog open when update fails", async () => {
      const user = userEvent.setup();
      mockMutateAsync.mockRejectedValueOnce(new Error("Update failed"));
      vi.mocked(useConnectors).mockReturnValue({
        data: [mockConnector],
        isLoading: false,
      } as ReturnType<typeof useConnectors>);

      renderAt("/integrations/connected");

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /rename/i }));
      await user.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("Update failed")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: /rename/i })).toBeInTheDocument();
    });

    it("does not render personal tool accounts in Connected tab", () => {
      vi.mocked(useToolAccounts).mockReturnValue({
        data: [
          {
            id: "acct-1",
            toolName: "cursor",
            isActive: true,
          },
        ],
        isLoading: false,
      } as ReturnType<typeof useToolAccounts>);

      renderAt("/integrations/connected");
      expect(screen.getByText("No integrations configured")).toBeInTheDocument();
      expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
    });
  });

  describe("Health banner", () => {
    const summary = (over: Partial<ConnectorHealthSummary>): ConnectorHealthSummary => ({
      total: 7,
      connected: 7,
      testing: 0,
      error: 0,
      disconnected: 0,
      stale: 0,
      stuck: 0,
      healthy: 7,
      ...over,
    });

    const mockHealth = (s: ConnectorHealthSummary) =>
      vi.mocked(useConnectorHealth).mockReturnValue({
        data: { summary: s, connectors: [] },
      } as ReturnType<typeof useConnectorHealth>);

    it('reads "All N connectors healthy" when everything is healthy', () => {
      mockHealth(summary({}));
      renderAt("/integrations/connected");
      expect(screen.getByText(/All 7 connectors healthy/i)).toBeInTheDocument();
    });

    it("is not all-healthy and shows a stale segment when a connector is stale", () => {
      mockHealth(summary({ connected: 7, healthy: 6, stale: 1 }));
      renderAt("/integrations/connected");
      expect(screen.queryByText(/All 7 connectors healthy/i)).not.toBeInTheDocument();
      expect(screen.getByText(/1 stale/i)).toBeInTheDocument();
    });

    it("shows a stuck segment when a connector is stuck", () => {
      mockHealth(summary({ connected: 6, testing: 1, healthy: 6, stuck: 1 }));
      renderAt("/integrations/connected");
      expect(screen.queryByText(/All .* connectors healthy/i)).not.toBeInTheDocument();
      expect(screen.getByText(/1 stuck/i)).toBeInTheDocument();
    });

    it("shows a syncing segment (not all-healthy) for fresh in-progress syncs", () => {
      mockHealth(summary({ connected: 5, testing: 2, healthy: 5, stuck: 0 }));
      renderAt("/integrations/connected");
      expect(screen.queryByText(/All .* connectors healthy/i)).not.toBeInTheDocument();
      expect(screen.getByText(/2 syncing/i)).toBeInTheDocument();
    });
  });

  describe("Available tab content", () => {
    it("renders provider category headings", () => {
      renderAt("/integrations/available");
      expect(screen.getByText("AI Tools")).toBeInTheDocument();
      expect(screen.getByText("Code Hosting")).toBeInTheDocument();
    });

    it("does not show personal tools in Available tab", () => {
      renderAt("/integrations/available");
      expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
      expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
    });

    it("shows OpenAI and Gemini as connectable", () => {
      renderAt("/integrations/available");
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Gemini")).toBeInTheDocument();

      const openaiCard = screen.getByTestId("provider-card-openai");
      expect(within(openaiCard).getByRole("button", { name: "Connect" })).toBeInTheDocument();

      const geminiCard = screen.getByTestId("provider-card-gemini");
      expect(within(geminiCard).getByRole("button", { name: "Connect" })).toBeInTheDocument();
    });

    it("still shows multi-instance providers (GitLab) even when already connected", () => {
      vi.mocked(useConnectors).mockReturnValue({
        data: [mockConnector],
        isLoading: false,
      } as ReturnType<typeof useConnectors>);

      renderAt("/integrations/available");
      expect(screen.getByText("GitLab")).toBeInTheDocument();
    });

    it("hides single-instance providers (Slack) once connected", () => {
      const slackConnector = {
        ...mockConnector,
        id: "conn-slack",
        connectorType: "slack",
      };
      vi.mocked(useConnectors).mockReturnValue({
        data: [slackConnector],
        isLoading: false,
      } as ReturnType<typeof useConnectors>);

      renderAt("/integrations/available");
      expect(screen.queryByText("Slack")).not.toBeInTheDocument();
    });
  });

  describe("Manage Catalog button", () => {
    it("is hidden while catalog enforcement is not shipped (SHOW_INTEGRATION_CATALOG=false)", () => {
      mockHasRole.mockReturnValue(true);
      renderAt("/integrations/connected");
      expect(screen.queryByRole("button", { name: /manage catalog/i })).not.toBeInTheDocument();
    });

    it("stays hidden for non-owners", () => {
      mockHasRole.mockReturnValue(false);
      renderAt("/integrations/connected");
      expect(screen.queryByRole("button", { name: /manage catalog/i })).not.toBeInTheDocument();
    });
  });

  // Mirrors the manage-route element in App.tsx. When SHOW_INTEGRATION_CATALOG
  // is off, a direct visit to /integrations/manage must redirect to
  // /integrations/connected (AIX-602 acceptance criterion).
  describe("Manage Catalog route guard", () => {
    it.skipIf(SHOW_INTEGRATION_CATALOG)(
      "redirects /integrations/manage to connected while the flag is off",
      () => {
        render(
          <MemoryRouter initialEntries={[AppRoutes.integrations.manage]}>
            <Routes>
              <Route
                path={AppRoutes.integrations.manage}
                element={
                  SHOW_INTEGRATION_CATALOG ? (
                    <div>manage catalog page</div>
                  ) : (
                    <Navigate to={AppRoutes.integrations.connected} replace />
                  )
                }
              />
              <Route path="/integrations/:status" element={<Integrations />} />
            </Routes>
          </MemoryRouter>,
        );

        expect(screen.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByText("manage catalog page")).not.toBeInTheDocument();
      },
    );
  });
});
