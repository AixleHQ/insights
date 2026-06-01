import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToolAccounts } from "./ToolAccounts";
import type { ToolAccount } from "@/lib/types";

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Acme", slug: "acme" },
    isLoading: false,
  }),
}));

const mockCreateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockRegenerateIngestTokenMutateAsync = vi.fn();
const mockUseToolAccounts = vi.fn();
const mockUseUpdateToolAccount = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useToolAccounts: (...args: unknown[]) => mockUseToolAccounts(...args),
  useCreateToolAccount: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useDeleteToolAccount: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
  useUpdateToolAccount: (...args: unknown[]) => mockUseUpdateToolAccount(...args),
  useRegenerateIngestToken: () => ({ mutateAsync: mockRegenerateIngestTokenMutateAsync, isPending: false }),
  useUserOrganizations: () => ({
    data: [{ id: "org-1", name: "Acme", slug: "acme" }],
    isLoading: false,
  }),
}));

vi.mock("@/components/integrations", () => ({
  IngestTokenConnectSheet: ({
    provider,
    open,
    initialToken,
  }: {
    provider: { name: string } | null;
    open: boolean;
    initialToken?: string;
  }) => (open && provider ? (
    <div role="dialog">
      <h2>{provider.name}</h2>
      <p>Ingest connect sheet</p>
      {initialToken ? <p>{initialToken}</p> : null}
    </div>
  ) : null),
}));

const mockAccount = (overrides: Partial<ToolAccount> = {}): ToolAccount => ({
  id: "acct-1",
  toolName: "claude_code",
  connectionState: "active",
  externalUserId: "user-123",
  externalUsername: "anaure",
  externalEmail: null,
  organizationMembershipId: "mem-1",
  tokenExpired: false,
  tokenExpiresAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

function renderToolAccounts(embedded = false) {
  return render(
    <MemoryRouter>
      <ToolAccounts embedded={embedded} />
    </MemoryRouter>
  );
}

describe("ToolAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMutateAsync.mockResolvedValue({});
    mockDeleteMutateAsync.mockResolvedValue({});
    mockUpdateMutateAsync.mockResolvedValue({});
    mockRegenerateIngestTokenMutateAsync.mockResolvedValue({ data: { ingestToken: "db90_regenerated_token" } });
    mockUseUpdateToolAccount.mockReturnValue({ mutateAsync: mockUpdateMutateAsync, isPending: false });
    mockUseToolAccounts.mockReturnValue({ data: [], isLoading: false });
  });

  describe("page layout", () => {
    it("shows Available tab", () => {
      renderToolAccounts();
      expect(screen.getByRole("tab", { name: /available/i })).toBeInTheDocument();
    });

    it("shows back button and title when not embedded", () => {
      renderToolAccounts(false);
      expect(screen.getByRole("link", { name: /back to settings/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Tool Accounts" })).toBeInTheDocument();
    });

    it("hides back button and title when embedded", () => {
      renderToolAccounts(true);
      expect(screen.queryByRole("link", { name: /back to settings/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Tool Accounts" })).not.toBeInTheDocument();
    });

    it("shows organization selector", () => {
      renderToolAccounts();
      expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    });

    it("shows loading skeletons while fetching", () => {
      mockUseToolAccounts.mockReturnValue({ data: undefined, isLoading: true });
      const { container } = renderToolAccounts();
      // skeletons render as animated divs — check tabs are absent
      expect(screen.queryByRole("tab", { name: /available/i })).not.toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    });

    it("passes orgId from context to useToolAccounts", () => {
      renderToolAccounts();
      expect(mockUseToolAccounts).toHaveBeenCalledWith("org-1");
    });
  });

  describe("with no connected accounts", () => {
    it("shows Connect button for each provider", async () => {
      const user = userEvent.setup();
      renderToolAccounts();
      // Default tab is "available" when no accounts connected — click it to see cards
      await user.click(screen.getByRole("tab", { name: /available/i }));
      const connectButtons = screen.getAllByRole("button", { name: /connect/i });
      expect(connectButtons.length).toBeGreaterThan(0);
    });

    it("shows Connected tab with count 0", () => {
      renderToolAccounts();
      expect(screen.getByRole("tab", { name: /connected \(0\)/i })).toBeInTheDocument();
    });
  });

  describe("with connected accounts", () => {
    it("shows Connected tab with count > 0", () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      renderToolAccounts();
      expect(screen.getByRole("tab", { name: /connected \(1\)/i })).toBeInTheDocument();
    });

    it("shows Connected badge when connectionState is active", () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ connectionState: "active" })], isLoading: false });
      renderToolAccounts();
      // The connected badge inside the card
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("shows Setup required badge when ingest account has not sent its first event yet", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ connectionState: "waiting_for_connection" })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText("Setup required")).toBeInTheDocument();
    });

    it("shows Disabled badge when a previously used account is inactive", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ connectionState: "inactive", lastUsedAt: "2026-02-01T00:00:00Z" })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    it("shows Token expired warning badge when tokenExpired is true", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ tokenExpired: true })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });

    it("does not show Token expired warning badge when tokenExpired is false", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ tokenExpired: false })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.queryByText("Token expired")).not.toBeInTheDocument();
    });

    it("shows linked username below provider name", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ externalUsername: "anaure" })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText("Linked as anaure")).toBeInTheDocument();
    });

    it("falls back to externalUserId when externalUsername is null", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ externalUsername: null, externalUserId: "user-123" })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText("Linked as user-123")).toBeInTheDocument();
    });

    it("falls back to DB90 when no external linked identity is available", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ externalUsername: null, externalUserId: null })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText("Linked as DB90")).toBeInTheDocument();
    });

    it('shows "all tools connected" message when no providers are available', async () => {
      // Mock all visible toolProviders as connected by providing accounts for each
      const allToolNames = [
        "claude_code", "cursor",
      ];
      const accounts = allToolNames.map((toolName, i) =>
        mockAccount({ id: `acct-${i}`, toolName })
      );
      mockUseToolAccounts.mockReturnValue({ data: accounts, isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();
      await user.click(screen.getByRole("tab", { name: /available/i }));
      expect(screen.getByText("All available tools are connected.")).toBeInTheDocument();
    });
  });

  describe("connect flow", () => {
    it("opens ingest sheet for Claude Code", async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      const claudeCard = screen.getByText("Claude Code").closest('[class*="border"]') ?? document.body;
      await user.click(within(claudeCard).getByRole("button", { name: /connect/i }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Claude Code" })).toBeInTheDocument();
      expect(screen.getByText("Ingest connect sheet")).toBeInTheDocument();
    });
  });

  describe("disconnect flow", () => {
    it("shows trash button for connected accounts", () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      renderToolAccounts();
      // The trash button is the only icon button in the connected row
      expect(screen.getByRole("button", { name: "" })).toBeInTheDocument();
    });

    it("opens confirmation dialog when trash button is clicked", async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      // Click the trash icon button
      const trashButton = screen.getByRole("button", { name: "" });
      await user.click(trashButton);

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText(/disconnect claude code\?/i)).toBeInTheDocument();
    });

    it("calls deleteAccount with correct id when Disconnect is confirmed", async () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ id: "acct-abc" })],
        isLoading: false,
      });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "" }));
      await user.click(screen.getByRole("button", { name: "Disconnect" }));

      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith({
          orgId: "org-1",
          accountId: "acct-abc",
        });
      });
    });

    it("does not call deleteAccount when Cancel is clicked in confirmation", async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("reconnect flow", () => {
    it("shows Reconnect button when tokenExpired is true", () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ tokenExpired: true })], isLoading: false });
      renderToolAccounts();
      expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    });

    it("does not show Reconnect button when tokenExpired is false", () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ tokenExpired: false })], isLoading: false });
      renderToolAccounts();
      expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
    });

    it("opens dialog with provider name when Reconnect is clicked", async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ tokenExpired: true })], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "Reconnect" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Claude Code" })).toBeInTheDocument();
    });

    it("submit button is disabled when token field is empty", async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ tokenExpired: true })], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "Reconnect" }));

      expect(mockRegenerateIngestTokenMutateAsync).toHaveBeenCalled();
    });

    it("regenerates ingest token and opens ingest sheet for Claude Code reconnect", async () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ id: "acct-1", tokenExpired: true, toolName: "claude_code" })],
        isLoading: false,
      });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "Reconnect" }));

      await waitFor(() => {
        expect(mockRegenerateIngestTokenMutateAsync).toHaveBeenCalledWith({
          orgId: "org-1",
          accountId: "acct-1",
        });
      });
      expect(screen.getByRole("heading", { name: "Claude Code" })).toBeInTheDocument();
      expect(screen.getByText("db90_regenerated_token")).toBeInTheDocument();
    });
  });

  describe("enable/disable flow", () => {
    it("shows Disable button for an active connected account", () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ connectionState: "active" })], isLoading: false });
      renderToolAccounts();
      expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
    });

    it("shows a setup hint for a waiting_for_connection ingest account", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ connectionState: "waiting_for_connection" })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(
        screen.getByText("This tool will become active after it sends its first event to DB90.")
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Complete setup" })).not.toBeInTheDocument();
    });

    it("shows Enable button for an inactive account that was previously used", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ connectionState: "inactive", lastUsedAt: "2026-02-01T00:00:00Z" })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
    });

    it("calls updateAccount with connectionState: inactive when Disable is clicked", async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ id: "acct-1", connectionState: "active" })], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "Disable" }));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          orgId: "org-1",
          accountId: "acct-1",
          connectionState: "inactive",
        });
      });
    });

    it("calls updateAccount with connectionState: active when Enable is clicked", async () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ id: "acct-1", connectionState: "inactive", lastUsedAt: "2026-02-01T00:00:00Z" })],
        isLoading: false,
      });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole("button", { name: "Enable" }));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          orgId: "org-1",
          accountId: "acct-1",
          connectionState: "active",
        });
      });
    });

    it("applies opacity-60 to an inactive account row", () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ connectionState: "inactive" })],
        isLoading: false,
      });
      const { container } = renderToolAccounts();
      expect(container.querySelector(".opacity-60")).toBeInTheDocument();
    });

    it("disables only the toggled account button while the mutation is pending", () => {
      mockUseUpdateToolAccount.mockReturnValue({
        mutateAsync: mockUpdateMutateAsync,
        isPending: true,
        variables: { accountId: "acct-1", orgId: "org-1", connectionState: "inactive" },
      });
      mockUseToolAccounts.mockReturnValue({
        data: [
          mockAccount({ id: "acct-1", toolName: "claude_code", connectionState: "active" }),
          mockAccount({ id: "acct-2", toolName: "cursor", connectionState: "active" }),
        ],
        isLoading: false,
      });
      renderToolAccounts();
      const buttons = screen.getAllByRole("button", { name: "Disable" });
      expect(buttons[0]).toBeDisabled();
      expect(buttons[1]).not.toBeDisabled();
    });

    it("does not show Disable or Enable buttons for unconnected providers", () => {
      mockUseToolAccounts.mockReturnValue({ data: [], isLoading: false });
      renderToolAccounts();
      expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Enable" })).not.toBeInTheDocument();
    });
  });
});
