import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeyConnectSheet } from "./ApiKeyConnectSheet";
import { ApiError } from "@/lib/api";
import type { ProviderInfo } from "./IntegrationCard";

// Mock OrgContext
vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

const mockMutateAsync = vi.fn();

// Mock useConnectWithApiKey
vi.mock("@/hooks/useApi", () => ({
  useConnectWithApiKey: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

const anthropicProvider: ProviderInfo = {
  id: "anthropic",
  name: "Anthropic API",
  description: "Direct Anthropic API integration",
  category: "ai",
  features: ["API key management", "Usage monitoring"],
  available: true,
};

const defaultProps = {
  provider: anthropicProvider,
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

function renderSheet(props: Partial<typeof defaultProps> = {}) {
  return render(<ApiKeyConnectSheet {...defaultProps} {...props} />);
}

describe("ApiKeyConnectSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
  });

  describe("Rendering", () => {
    it("renders provider name in the header", () => {
      renderSheet();
      expect(screen.getByText("Anthropic API")).toBeInTheDocument();
    });

    it("renders provider description", () => {
      renderSheet();
      expect(screen.getByText("Direct Anthropic API integration")).toBeInTheDocument();
    });

    it("renders the API key input as a password field", () => {
      renderSheet();
      const input = screen.getByLabelText("API Key");
      expect(input).toHaveAttribute("type", "password");
    });

    it("renders Connect and Cancel buttons", () => {
      renderSheet();
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("disables the Connect button when API key is empty", () => {
      renderSheet();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });

    it("does not render when provider is null", () => {
      renderSheet({ provider: null });
      // Sheet renders but no provider-specific content
      expect(screen.queryByText("Anthropic API")).not.toBeInTheDocument();
    });
  });

  describe("Form interaction", () => {
    it("enables the Connect button when API key is entered", async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.type(screen.getByLabelText("API Key"), "sk-test-key");

      expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
    });

    it("calls mutateAsync with correct params on submit", async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.type(screen.getByLabelText("API Key"), "sk-test-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          orgId: "test-org-id",
          connectorType: "anthropic",
          apiKey: "sk-test-key",
        });
      });
    });

    it("calls onOpenChange(false) and onSuccess after successful submission", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();
      renderSheet({ onOpenChange, onSuccess });

      await user.type(screen.getByLabelText("API Key"), "sk-test-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('shows "Connecting…" text while submitting', async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {})); // never resolves
      const user = userEvent.setup();
      renderSheet();

      await user.type(screen.getByLabelText("API Key"), "sk-test-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      expect(screen.getByRole("button", { name: "Connecting…" })).toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("shows inline error when API returns 422 with access_token error", async () => {
      mockMutateAsync.mockRejectedValue(
        new ApiError("Validation error", 422, {
          errors: { access_token: ["Invalid API key"] },
        })
      );
      const user = userEvent.setup();
      renderSheet();

      await user.type(screen.getByLabelText("API Key"), "bad-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Invalid API key")).toBeInTheDocument();
      });
    });

    it("shows generic error message for non-422 API errors", async () => {
      mockMutateAsync.mockRejectedValue(new Error("Network error"));
      const user = userEvent.setup();
      renderSheet();

      await user.type(screen.getByLabelText("API Key"), "some-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("does not close sheet when submission fails", async () => {
      mockMutateAsync.mockRejectedValue(
        new ApiError("Validation error", 422, {
          errors: { access_token: ["Invalid API key"] },
        })
      );
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderSheet({ onOpenChange });

      await user.type(screen.getByLabelText("API Key"), "bad-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Invalid API key")).toBeInTheDocument();
      });
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("clears the error when Cancel is clicked after a failure", async () => {
      mockMutateAsync.mockRejectedValueOnce(
        new ApiError("Validation error", 422, {
          errors: { access_token: ["Invalid API key"] },
        })
      );
      mockMutateAsync.mockResolvedValue({});
      const user = userEvent.setup();
      renderSheet();

      // Trigger error
      await user.type(screen.getByLabelText("API Key"), "bad-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));
      await waitFor(() => {
        expect(screen.getByText("Invalid API key")).toBeInTheDocument();
      });

      // Cancel clears state via handleOpenChange(false)
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      // Error should be gone from state (even though sheet may visually animate out)
      expect(screen.queryByText("Invalid API key")).not.toBeInTheDocument();
    });
  });

  describe("Cancel button", () => {
    it("calls onOpenChange(false) when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderSheet({ onOpenChange });

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("does not call mutateAsync when Cancel is clicked", async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("onConnect override prop", () => {
    it("calls onConnect instead of mutateAsync when provided", async () => {
      const onConnect = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderSheet({ onConnect });

      await user.type(screen.getByLabelText("API Key"), "sk-project-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(onConnect).toHaveBeenCalledWith("sk-project-key");
        expect(mockMutateAsync).not.toHaveBeenCalled();
      });
    });

    it("does not call mutateAsync when onConnect is provided", async () => {
      const onConnect = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderSheet({ onConnect });

      await user.type(screen.getByLabelText("API Key"), "sk-project-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(mockMutateAsync).not.toHaveBeenCalled();
      });
    });

    it("closes the sheet and calls onSuccess after onConnect resolves", async () => {
      const onConnect = vi.fn().mockResolvedValue(undefined);
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();
      const user = userEvent.setup();
      renderSheet({ onConnect, onOpenChange, onSuccess });

      await user.type(screen.getByLabelText("API Key"), "sk-project-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("shows inline error when onConnect throws a 422 ApiError", async () => {
      const onConnect = vi.fn().mockRejectedValue(
        new ApiError("Validation error", 422, {
          errors: { access_token: ["Invalid project API key"] },
        })
      );
      const user = userEvent.setup();
      renderSheet({ onConnect });

      await user.type(screen.getByLabelText("API Key"), "bad-key");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Invalid project API key")).toBeInTheDocument();
      });
    });
  });
});
