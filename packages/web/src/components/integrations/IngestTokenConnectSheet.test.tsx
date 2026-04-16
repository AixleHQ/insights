import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IngestTokenConnectSheet } from "./IngestTokenConnectSheet";
import { ApiError } from "@/lib/api";
import type { ProviderInfo } from "./IntegrationCard";

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

const mockMutateAsync = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useCreateToolAccount: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

const cursorProvider: ProviderInfo = {
  id: "cursor",
  name: "Cursor",
  description: "Monitor Cursor IDE AI usage",
  category: "ai",
  features: ["AI completions tracking", "Chat usage analytics", "Token consumption"],
  available: true,
};

const claudeCodeProvider: ProviderInfo = {
  id: "claude-code",
  name: "Claude Code",
  description: "Monitor Claude Code CLI usage",
  category: "ai",
  features: ["Session tracking", "Code generation analytics"],
  available: true,
};

const defaultProps = {
  provider: cursorProvider,
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

function renderSheet(props: Partial<typeof defaultProps> = {}) {
  return render(<IngestTokenConnectSheet {...defaultProps} {...props} />);
}

describe("IngestTokenConnectSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({
      data: { ingestToken: "db90_abc123testtoken", toolName: "cursor" },
    });
  });

  describe("Connect step (initial)", () => {
    it("renders provider name in the header", () => {
      renderSheet();
      expect(screen.getByText("Cursor")).toBeInTheDocument();
    });

    it("renders provider description", () => {
      renderSheet();
      expect(screen.getByText("Monitor Cursor IDE AI usage")).toBeInTheDocument();
    });

    it("renders provider features", () => {
      renderSheet();
      expect(screen.getByText("AI completions tracking")).toBeInTheDocument();
    });

    it("renders a Connect button", () => {
      renderSheet();
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    });

    it("renders a Cancel button", () => {
      renderSheet();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });
  });

  describe("Happy path: Connect flow", () => {
    it("calls useCreateToolAccount with the correct toolName for cursor", async () => {
      const user = userEvent.setup();
      renderSheet({ provider: cursorProvider });

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          orgId: "test-org-id",
          toolName: "cursor",
        });
      });
    });

    it("calls useCreateToolAccount with the correct toolName for claude-code", async () => {
      const user = userEvent.setup();
      renderSheet({ provider: claudeCodeProvider });

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          orgId: "test-org-id",
          toolName: "claude_code",
        });
      });
    });

    it("transitions to the setup step on success", async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Your ingest token")).toBeInTheDocument();
      });
    });

    it("displays the token in a read-only input on setup step", async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        const tokenInput = screen.getByLabelText("Ingest token") as HTMLInputElement;
        expect(tokenInput.value).toBe("db90_abc123testtoken");
        expect(tokenInput).toHaveAttribute("readonly");
      });
    });

    it('shows "This token will not be shown again" warning', async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText(/This token will not be shown again/i)).toBeInTheDocument();
      });
    });
  });

  describe("Setup step: cursor instructions", () => {
    async function goToSetupStep(provider = cursorProvider) {
      const user = userEvent.setup();
      renderSheet({ provider });
      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Your ingest token");
      return user;
    }

    it("shows npx db90-cursor command for cursor", async () => {
      await goToSetupStep(cursorProvider);
      expect(screen.getByText(/npx db90-cursor --token/i)).toBeInTheDocument();
    });

    it("shows settings.json instructions for claude-code", async () => {
      await goToSetupStep(claudeCodeProvider);
      expect(screen.getByText(/~\/.claude\/settings\.json/i)).toBeInTheDocument();
    });
  });

  describe("Copy button", () => {
    it("copies the token to clipboard when clicked", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);

      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Your ingest token");

      await user.click(screen.getByRole("button", { name: "Copy token" }));

      expect(writeText).toHaveBeenCalledWith("db90_abc123testtoken");
    });

    it('changes aria-label to "Copied" after clicking', async () => {
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Your ingest token");

      await user.click(screen.getByRole("button", { name: "Copy token" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
      });
    });
  });

  describe("Done button", () => {
    it("calls onSuccess when Done is clicked", async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      renderSheet({ onSuccess });

      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Your ingest token");

      await user.click(screen.getByRole("button", { name: "Done" }));

      expect(onSuccess).toHaveBeenCalled();
    });

    it("calls onOpenChange(false) when Done is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderSheet({ onOpenChange });

      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Your ingest token");

      await user.click(screen.getByRole("button", { name: "Done" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Sheet close / reset", () => {
    it("resets to connect step when sheet is closed", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const { rerender } = renderSheet({ onOpenChange });

      // Go to setup step
      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Your ingest token");

      // Simulate sheet close (Cancel triggers onOpenChange(false))
      await user.click(screen.getByRole("button", { name: "Done" }));

      // Reopen the sheet
      rerender(
        <IngestTokenConnectSheet
          {...defaultProps}
          open={true}
          onOpenChange={onOpenChange}
        />
      );

      // Should be back on connect step
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
      expect(screen.queryByText("Your ingest token")).not.toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("shows an error message when the API call fails", async () => {
      mockMutateAsync.mockRejectedValue(new Error("Server error"));
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });
    });

    it("shows error from ApiError response body", async () => {
      mockMutateAsync.mockRejectedValue(
        new ApiError("Unprocessable Entity", 422, {
          errors: { tool_name: ["account already exists for this membership"] },
        })
      );
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("account already exists for this membership")).toBeInTheDocument();
      });
    });

    it("stays on connect step when API call fails", async () => {
      mockMutateAsync.mockRejectedValue(new Error("Server error"));
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });

      expect(screen.queryByText("Your ingest token")).not.toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it('shows "Connecting…" while submitting', async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {})); // never resolves
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Connecting…" })).toBeInTheDocument();
      });
    });

    it("disables Connect button while submitting", async () => {
      mockMutateAsync.mockImplementation(() => new Promise(() => {})); // never resolves
      const user = userEvent.setup();
      renderSheet();

      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
      });
    });
  });
});
