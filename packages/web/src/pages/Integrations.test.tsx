import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Integrations } from "./Integrations";

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

const mockMutateAsync = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useConnectors: vi.fn(() => ({ data: [], isLoading: false })),
  useSyncConnector: () => ({ mutateAsync: mockMutateAsync }),
  useDeleteConnector: () => ({ mutateAsync: mockMutateAsync }),
  useTestConnector: () => ({ mutateAsync: mockMutateAsync }),
  useConnectWithApiKey: () => ({ mutateAsync: mockMutateAsync }),
  useConnectSlack: () => ({ mutateAsync: mockMutateAsync }),
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

import { useConnectors } from "@/hooks/useApi";

const mockConnector = {
  id: "conn-1",
  connector_type: "github",
  status: "connected" as const,
  external_account_name: "my-org",
  last_sync_at: null,
  last_error: null,
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
    vi.mocked(useConnectors).mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useConnectors>);
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
    });
  });

  describe("Available tab content", () => {
    it("renders provider category headings", () => {
      renderAt("/integrations/available");
      expect(screen.getByText("AI Tools")).toBeInTheDocument();
      expect(screen.getByText("Code Hosting")).toBeInTheDocument();
    });

    it("does not show providers that are already connected", () => {
      vi.mocked(useConnectors).mockReturnValue({
        data: [mockConnector],
        isLoading: false,
      } as ReturnType<typeof useConnectors>);

      renderAt("/integrations/available");
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    });
  });
});
