import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntegrationsManage } from "./IntegrationsManage";

const mockUseOrgProviderSettings = vi.fn();
const mockMutate = vi.fn();

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useOrgProviderSettings: () => mockUseOrgProviderSettings(),
  useUpdateOrgProviderSetting: () => ({
    mutate: mockMutate,
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("@/components/icons", () => ({
  ProviderLogo: ({ provider }: { provider: string }) => <span data-testid={`logo-${provider}`} />,
}));

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <IntegrationsManage />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("IntegrationsManage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOrgProviderSettings.mockReturnValue({
      enabledMap: {},
      isLoading: false,
      isError: false,
    });
  });

  describe("page structure", () => {
    it("renders the page heading", () => {
      renderComponent();
      expect(screen.getByRole("heading", { name: /manage integration catalog/i })).toBeInTheDocument();
    });

    it("renders all 6 category tabs", () => {
      renderComponent();
      expect(screen.getByRole("tab", { name: /^all$/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /code hosting/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /project management/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /ai tools/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /design/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /communication/i })).toBeInTheDocument();
    });

    it("shows all providers on the All tab by default", () => {
      renderComponent();
      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows skeletons while loading", () => {
      mockUseOrgProviderSettings.mockReturnValue({
        enabledMap: {},
        isLoading: true,
        isError: false,
      });
      const { container } = renderComponent();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    it("shows error alert when settings fail to load", () => {
      mockUseOrgProviderSettings.mockReturnValue({
        enabledMap: {},
        isLoading: false,
        isError: true,
      });
      renderComponent();
      expect(screen.getByText(/failed to load integration settings/i)).toBeInTheDocument();
    });
  });

  describe("category filtering", () => {
    it("filters to code hosting providers when Code Hosting tab is clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /code hosting/i }));

      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.queryByText("Slack")).not.toBeInTheDocument();
      expect(screen.queryByText("Anthropic API")).not.toBeInTheDocument();
    });

    it("filters to AI providers when AI Tools tab is clicked", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /ai tools/i }));

      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    });
  });

  describe("enabled state", () => {
    it("treats missing provider as enabled (fail-open)", () => {
      mockUseOrgProviderSettings.mockReturnValue({
        enabledMap: {},
        isLoading: false,
        isError: false,
      });
      renderComponent();
      const switches = screen.getAllByRole("switch");
      const enabledSwitches = switches.filter((sw) => sw.getAttribute("aria-checked") === "true");
      expect(enabledSwitches.length).toBeGreaterThan(0);
    });

    it("shows a disabled switch for a provider explicitly set to false", () => {
      mockUseOrgProviderSettings.mockReturnValue({
        enabledMap: { github: false },
        isLoading: false,
        isError: false,
      });
      renderComponent();
      const githubCard = screen.getByText("GitHub").closest(".transition-opacity");
      const sw = githubCard?.querySelector('[role="switch"]');
      expect(sw).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("toggling a provider", () => {
    it("calls useUpdateOrgProviderSetting with provider and enabled=false when toggled off", async () => {
      const user = userEvent.setup();
      mockUseOrgProviderSettings.mockReturnValue({
        enabledMap: { github: true },
        isLoading: false,
        isError: false,
      });
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /code hosting/i }));
      const githubCard = screen.getByText("GitHub").closest(".transition-opacity")!;
      const sw = githubCard.querySelector('[role="switch"]')!;
      await user.click(sw);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({ provider: "github", enabled: false });
      });
    });
  });
});
