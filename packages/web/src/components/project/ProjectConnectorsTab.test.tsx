import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectConnectorsTab } from "./ProjectConnectorsTab";
import { ApiError } from "@/lib/api";
import type { ProjectConnector } from "@/lib/types";

const mockProjectConnectors = vi.fn();
const mockConnectWithApiKey = vi.fn();
const mockConnectWithSlack = vi.fn();
const mockConnectWithWebhook = vi.fn();
const mockDeleteConnector = vi.fn();
const mockTestConnector = vi.fn();
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
  useProjectTestConnector: () => ({ mutateAsync: mockTestConnector }),
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
    mockTestConnector.mockResolvedValue({ data: { success: true } });
    mockOrgProviderSettings.mockReturnValue({ enabledMap: {}, isLoading: false, isError: false });
  });

  describe("Loading state", () => {
    it("shows skeleton loaders while fetching", () => {
      mockProjectConnectors.mockReturnValue({ data: undefined, isLoading: true });
      renderComponent();
      // Tab labels still render while loading
      expect(screen.getByRole("tab", { name: /connected/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /available/i })).toBeInTheDocument();
    });
  });

  describe("Connected tab", () => {
    it("shows empty state when no connectors are connected", () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByText("No providers connected")).toBeInTheDocument();
    });

    it("displays connected connector count in tab label", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByRole("tab", { name: /connected \(1\)/i })).toBeInTheDocument();
    });

    it("renders connected connector as card with provider name", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      // IntegrationCard for connected connector shows integration.name (connectorType when no external name)
      // appears in both title and description — use getAllByText
      expect(screen.getAllByText("anthropic").length).toBeGreaterThanOrEqual(1);
    });

    it("shows Connected status badge for a connected connector", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("does not show Last error panel when status is connected but lastError is stale", () => {
      const stale: ProjectConnector = {
        ...connectedAnthropicConnector,
        status: "connected",
        lastError: "stale from prior failure",
      };
      mockProjectConnectors.mockReturnValue({ data: [stale], isLoading: false });
      renderComponent();
      expect(screen.getByText("Connected")).toBeInTheDocument();
      expect(screen.queryByText("Last error")).not.toBeInTheDocument();
    });

    it("shows Error status badge for a connector with an error", () => {
      const errorConnector: ProjectConnector = {
        ...connectedAnthropicConnector,
        status: "error",
        lastError: "API key expired",
      };
      mockProjectConnectors.mockReturnValue({ data: [errorConnector], isLoading: false });
      renderComponent();
      expect(screen.getByText("Error")).toBeInTheDocument();
    });
  });

  describe("Available tab", () => {
    it("shows all 5 providers when none are connected", () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByRole("tab", { name: /available \(5\)/i })).toBeInTheDocument();
    });

    it("excludes already-connected providers from the Available tab count", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByRole("tab", { name: /available \(4\)/i })).toBeInTheDocument();
    });

    it("shows all provider names in the Available tab", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));

      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("OpenRouter")).toBeInTheDocument();
      expect(screen.getByText("Gemini")).toBeInTheDocument();
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });

    it("hides a provider that is disabled in the org catalog", async () => {
      mockOrgProviderSettings.mockReturnValue({
        enabledMap: { anthropic: false },
        isLoading: false,
        isError: false,
      });
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));

      expect(screen.queryByText("Anthropic API")).not.toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    it("shows all providers when catalog settings are loading (fail-open)", async () => {
      mockOrgProviderSettings.mockReturnValue({
        enabledMap: {},
        isLoading: true,
        isError: false,
      });
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available \(5\)/i }));

      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
    });

    it("shows empty state when all single-instance providers are connected and Slack is disabled", async () => {
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
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available \(0\)/i }));

      expect(screen.getByText("All providers are connected")).toBeInTheDocument();
    });

    it("keeps Slack available when one Slack connector is already connected", async () => {
      const slackConnector: ProjectConnector = {
        id: "conn-slack-1",
        connectorType: "slack",
        isActive: true,
        status: "connected",
        scope: "project",
        label: "#general",
        externalAccountName: "#general",
      };

      mockProjectConnectors.mockReturnValue({
        data: [slackConnector],
        isLoading: false,
      });

      const user = userEvent.setup();
      renderComponent();

      // Switch to Available tab
      await user.click(screen.getByRole("tab", { name: /available/i }));

      // Slack must still appear in Available even though it's connected
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });
  });

  describe("Connect flow", () => {
    it("opens the API key sheet when clicking Connect on an available provider", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));
      const connectButtons = screen.getAllByRole("button", { name: /^connect$/i });
      await user.click(connectButtons[0]);

      expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    });

    it("calls useProjectConnectWithApiKey with projectId and connectorType on submit", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));
      const connectButtons = screen.getAllByRole("button", { name: /^connect$/i });
      await user.click(connectButtons[0]);

      await user.type(screen.getByLabelText("API Key"), "sk-ant-test-key");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(mockConnectWithApiKey).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: PROJECT_ID,
            apiKey: "sk-ant-test-key",
          })
        );
      });
    });

    it("opens SlackConnectSheet with Webhook URL and Channel label when connecting Slack", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));
      const slackCard = screen.getByTestId("provider-card-slack");
      await user.click(within(slackCard).getByRole("button", { name: /^connect$/i }));

      expect(screen.getByLabelText(/webhook url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/channel label/i)).toBeInTheDocument();
    });

    it("calls useProjectConnectWithSlack with projectId, webhookUrl, and channelLabel on submit", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));
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
        expect(mockConnectWithWebhook).not.toHaveBeenCalled();
      });
    });

    it("calls useProjectConnectWithSlack without channelLabel when channel is empty", async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));
      const slackCard = screen.getByTestId("provider-card-slack");
      await user.click(within(slackCard).getByRole("button", { name: /^connect$/i }));

      await user.type(screen.getByLabelText(/webhook url/i), "https://hooks.slack.com/services/T00/B00/xxx");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(mockConnectWithSlack).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
          channelLabel: undefined,
        });
      });
    });

    it("switches to Connected tab and shows Slack connector after connecting", async () => {
      const connectedSlack: ProjectConnector = {
        id: "slack-1",
        project_id: PROJECT_ID,
        connectorType: "slack",
        isActive: true,
        status: "connected",
        externalAccountName: null,
        lastSyncAt: null,
        lastError: null,
      };

      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("tab", { name: /available/i }));
      const slackCard = screen.getByTestId("provider-card-slack");
      await user.click(within(slackCard).getByRole("button", { name: /^connect$/i }));

      // Update mock before submit so re-render after onSuccess sees the new connector
      mockProjectConnectors.mockReturnValue({ data: [connectedSlack], isLoading: false });

      await user.type(screen.getByLabelText(/webhook url/i), "https://hooks.slack.com/services/T00/B00/xxx");
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /connected \(1\)/i })).toBeInTheDocument();
      });

      // Slack is multi-instance so it stays in Available even after connecting
      expect(screen.getByRole("tab", { name: /available \(5\)/i })).toBeInTheDocument();
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

      await user.click(screen.getByRole("tab", { name: /available/i }));
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

      await user.click(screen.getByRole("tab", { name: /available/i }));
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

      // Open the actions dropdown (sr-only label: "Actions")
      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /disconnect/i }));

      // Confirm in the AlertDialog
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

      // Cancel the AlertDialog
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

  describe("Test connection flow", () => {
    it("calls testConnector with projectId and connectorId", async () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));

      await waitFor(() => {
        expect(mockTestConnector).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          connectorId: connectedAnthropicConnector.id,
        });
      });
    });

    it("shows Testing… badge during active test", async () => {
      let resolveTest!: () => void;
      mockTestConnector.mockReturnValue(
        new Promise<void>((resolve) => { resolveTest = resolve; })
      );
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText("Testing…")).toBeInTheDocument();
      });

      // Resolve inside act so the resulting state update (setTestingConnectorId(null)) is flushed cleanly
      await act(async () => { resolveTest(); });
    });

    it("shows inline error alert when test mutation fails", async () => {
      mockTestConnector.mockRejectedValue(new Error("Network error"));
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to run connection test. Please try again.")).toBeInTheDocument();
      });
    });

    it("clears the error alert when a subsequent test is triggered", async () => {
      mockTestConnector.mockRejectedValueOnce(new Error("Network error"));
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));
      await waitFor(() => {
        expect(screen.getByText("Failed to run connection test. Please try again.")).toBeInTheDocument();
      });

      mockTestConnector.mockResolvedValue({ data: { success: true } });
      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.queryByText("Failed to run connection test. Please try again.")).not.toBeInTheDocument();
      });
    });

    it("shows updated status badge after test completes and query refreshes", async () => {
      const errorConnector: ProjectConnector = {
        ...connectedAnthropicConnector,
        status: "error",
        lastError: "Invalid API key",
      };

      // First render: connector is in error state
      mockProjectConnectors.mockReturnValue({ data: [errorConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      expect(screen.getByText("Error")).toBeInTheDocument();

      // Simulate test fixing the connector: query returns connected state after test
      mockTestConnector.mockImplementation(async () => {
        mockProjectConnectors.mockReturnValue({
          data: [{ ...connectedAnthropicConnector, status: "connected", lastError: null }],
          isLoading: false,
        });
        return { data: { success: true } };
      });

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText("Connected")).toBeInTheDocument();
      });
    });
  });

  describe("Connector health display", () => {
    it("shows last sync time when connector has lastSyncAt", () => {
      const syncedConnector: ProjectConnector = {
        ...connectedAnthropicConnector,
        lastSyncAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      };
      mockProjectConnectors.mockReturnValue({ data: [syncedConnector], isLoading: false });
      renderComponent();

      expect(screen.getByText(/last synced/i)).toBeInTheDocument();
    });

    it("does not show last sync row when lastSyncAt is null", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();

      expect(screen.queryByText(/last synced/i)).not.toBeInTheDocument();
    });

    it("shows error panel when connector has lastError", () => {
      const errorConnector: ProjectConnector = {
        ...connectedAnthropicConnector,
        status: "error",
        lastError: "Unauthorized: invalid API key",
      };
      mockProjectConnectors.mockReturnValue({ data: [errorConnector], isLoading: false });
      renderComponent();

      expect(screen.getByRole("button", { name: /last error/i })).toBeInTheDocument();
    });

    it("does not show error panel when connector has no lastError", () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();

      expect(screen.queryByRole("button", { name: /last error/i })).not.toBeInTheDocument();
    });

    it("expands error panel to show error message detail", async () => {
      const user = userEvent.setup();
      const errorConnector: ProjectConnector = {
        ...connectedAnthropicConnector,
        status: "error",
        lastError: "Connection timeout after 30s",
      };
      mockProjectConnectors.mockReturnValue({ data: [errorConnector], isLoading: false });
      renderComponent();

      await user.click(screen.getByRole("button", { name: /last error/i }));

      expect(screen.getByText("Connection timeout after 30s")).toBeInTheDocument();
    });
  });
});
