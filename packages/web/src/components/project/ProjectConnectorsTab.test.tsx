import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectConnectorsTab } from "./ProjectConnectorsTab";
import { ApiError } from "@/lib/api";
import type { ProjectConnector } from "@/lib/types";

const mockProjectConnectors = vi.fn();
const mockConnectWithApiKey = vi.fn();
const mockConnectWithSlack = vi.fn();
const mockDeleteConnector = vi.fn();
const mockOrgProviderSettings = vi.fn();

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useProjectConnectors: () => mockProjectConnectors(),
  useProjectConnectWithApiKey: () => ({ mutateAsync: mockConnectWithApiKey }),
  useProjectConnectWithSlack: () => ({ mutateAsync: mockConnectWithSlack }),
  useProjectDeleteConnector: () => ({ mutateAsync: mockDeleteConnector }),
  useProjectTestConnector: () => ({ mutateAsync: vi.fn() }),
  useProjectUpdateConnector: () => ({ mutateAsync: vi.fn() }),
  useConnectWithApiKey: () => ({ mutateAsync: vi.fn() }),
  useOrgProviderSettings: () => mockOrgProviderSettings(),
}));

const PROJECT_ID = "test-project-id";

const connectedAnthropicConnector: ProjectConnector = {
  id: "connector-1",
  project_id: PROJECT_ID,
  connectorType: "anthropic",
  isActive: true,
  status: "connected",
  externalAccountName: null,
  lastSyncAt: null,
  lastError: null,
};

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProjectConnectorsTab projectId={PROJECT_ID} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("ProjectConnectorsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectWithApiKey.mockResolvedValue({});
    mockConnectWithSlack.mockResolvedValue({});
    mockDeleteConnector.mockResolvedValue({});
    mockOrgProviderSettings.mockReturnValue({ enabledMap: {}, isLoading: false, isError: false });
  });

  describe("Loading state", () => {
    it("shows skeleton loaders while fetching", () => {
      mockProjectConnectors.mockReturnValue({ data: undefined, isLoading: true });
      renderComponent();
      expect(screen.getByText("Currently Connected")).toBeInTheDocument();
    });
  });

  describe("Currently Connected section", () => {
    it("hides the connected section when no connectors are connected", () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.queryByText("Currently Connected")).not.toBeInTheDocument();
    });

    it("shows Currently Connected label and provider name when connected", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByText("Currently Connected")).toBeInTheDocument();
      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
    });

    it("shows features as dot-separated text on connected card", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByText(/Usage monitoring/)).toBeInTheDocument();
    });
  });

  describe("Available providers section", () => {
    it("shows all provider names when none are connected", () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("OpenRouter")).toBeInTheDocument();
      expect(screen.getByText("Gemini")).toBeInTheDocument();
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });

    it("hides a provider that is disabled in the org catalog", () => {
      mockOrgProviderSettings.mockReturnValue({
        enabledMap: { anthropic: false },
        isLoading: false,
        isError: false,
      });
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.queryByText("Anthropic API")).not.toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    it("shows all providers when catalog settings are loading (fail-open)", () => {
      mockOrgProviderSettings.mockReturnValue({ enabledMap: {}, isLoading: true, isError: false });
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
    });

    it("hides available section when all single-instance providers are connected and Slack is disabled", () => {
      mockOrgProviderSettings.mockReturnValue({
        enabledMap: { slack: false },
        isLoading: false,
        isError: false,
      });
      const allConnected: ProjectConnector[] = [
        { ...connectedAnthropicConnector, id: "1", connectorType: "anthropic" },
        { ...connectedAnthropicConnector, id: "2", connectorType: "openai" },
        { ...connectedAnthropicConnector, id: "3", connectorType: "openrouter" },
        { ...connectedAnthropicConnector, id: "4", connectorType: "gemini" },
        { ...connectedAnthropicConnector, id: "5", connectorType: "slack" },
      ];
      mockProjectConnectors.mockReturnValue({ data: allConnected, isLoading: false });
      renderComponent();
      // All providers connected — no Connect buttons visible
      expect(screen.queryByRole("button", { name: /^connect$/i })).not.toBeInTheDocument();
    });

    it("keeps Slack available when one Slack connector is already connected", () => {
      const slackConnector: ProjectConnector = {
        id: "conn-slack-1",
        connectorType: "slack",
        isActive: true,
        status: "connected",
        scope: "project",
        label: "#general",
        externalAccountName: "#general",
      };
      mockProjectConnectors.mockReturnValue({ data: [slackConnector], isLoading: false });
      renderComponent();
      // Slack appears in available section (multi-instance)
      expect(screen.getByTestId("provider-card-slack")).toBeInTheDocument();
    });

    it("shows category filter pills", () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    });

    it("excludes already-connected single-instance provider from available", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      // Anthropic is connected, so provider-card-anthropic should not be in available
      expect(screen.queryByTestId("provider-card-anthropic")).not.toBeInTheDocument();
    });
  });

  describe("Connect flow", () => {
    it("opens the API key sheet when clicking Connect on an available provider", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      const connectButtons = screen.getAllByRole("button", { name: /^connect$/i });
      await user.click(connectButtons[0]);

      expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    });

    it("calls useProjectConnectWithApiKey with projectId and connectorType on submit", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      const connectButtons = screen.getAllByRole("button", { name: /^connect$/i });
      await user.click(connectButtons[0]);

      await user.type(screen.getByLabelText("API Key"), "sk-ant-test-key");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(mockConnectWithApiKey).toHaveBeenCalledWith(
          expect.objectContaining({ projectId: PROJECT_ID, apiKey: "sk-ant-test-key" })
        );
      });
    });

    it("opens SlackConnectSheet when connecting Slack", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      const slackCard = screen.getByTestId("provider-card-slack");
      await user.click(within(slackCard).getByRole("button", { name: /^connect$/i }));

      expect(screen.getByLabelText(/webhook url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/channel label/i)).toBeInTheDocument();
    });

    it("calls useProjectConnectWithSlack with projectId, webhookUrl, channelLabel on submit", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      const slackCard = screen.getByTestId("provider-card-slack");
      await user.click(within(slackCard).getByRole("button", { name: /^connect$/i }));

      await user.type(screen.getByLabelText(/webhook url/i), "https://hooks.slack.com/services/T00/B00/xxx");
      await user.type(screen.getByLabelText(/channel label/i), "#alerts");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(mockConnectWithSlack).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
          channelLabel: "#alerts",
        });
      });
    });

    it("shows inline error when Slack webhook URL is invalid", async () => {
      mockConnectWithSlack.mockRejectedValue(
        new ApiError("Validation error", 422, {
          errors: { access_token: ["Invalid Slack webhook URL format"] },
        })
      );
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      const slackCard = screen.getByTestId("provider-card-slack");
      await user.click(within(slackCard).getByRole("button", { name: /^connect$/i }));

      await user.type(screen.getByLabelText(/webhook url/i), "not-a-valid-url");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid Slack webhook URL format")).toBeInTheDocument();
      });
    });

    it("shows inline error when API key is invalid", async () => {
      mockConnectWithApiKey.mockRejectedValue(
        new ApiError("Validation error", 422, {
          errors: { access_token: ["Invalid API key"] },
        })
      );
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      const connectButtons = screen.getAllByRole("button", { name: /^connect$/i });
      await user.click(connectButtons[0]);

      await user.type(screen.getByLabelText("API Key"), "bad-key");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid API key")).toBeInTheDocument();
      });
    });
  });

  describe("Disconnect flow", () => {
    it("calls deleteConnector with projectId and connectorId on confirm", async () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /disconnect/i }));
      await user.click(screen.getByRole("button", { name: /^disconnect$/i }));

      await waitFor(() => {
        expect(mockDeleteConnector).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          connectorId: connectedAnthropicConnector.id,
        });
      });
    });

    it("does not call deleteConnector when confirm is cancelled", async () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /disconnect/i }));
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(mockDeleteConnector).not.toHaveBeenCalled();
    });

    it("shows inline error alert when disconnect mutation fails", async () => {
      mockDeleteConnector.mockRejectedValue(new Error("Network error"));
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /disconnect/i }));
      await user.click(screen.getByRole("button", { name: /^disconnect$/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to disconnect. Please try again.")).toBeInTheDocument();
      });
    });
  });
});
