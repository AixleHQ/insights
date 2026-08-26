import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IngestTokenConnectSheet } from "./IngestTokenConnectSheet";
import { ApiError } from "@/lib/api";
import type { ProviderInfo } from "./IntegrationCard";

// Only the environment predicate is stubbed — every other channel behaviour stays real.
// The predicate's own logic (APP_ENV, Keycloak-host inference, fail-open) is covered
// directly in src/lib/aixle-cli.test.ts. Defaults to true, matching a dev/test box.
const channelEnv = vi.hoisted(() => ({ selectable: true }));

vi.mock("@/lib/aixle-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aixle-cli")>();
  return { ...actual, isAixleChannelSelectable: () => channelEnv.selectable };
});

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

    it("renders init command with --host and --keycloak-url for cursor (no tabs, standalone CLI removed)", async () => {
      await goToSetupStep(cursorProvider);
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Recommended MCP install command/i)).toHaveTextContent(
        /npx -y @aixle\/insights init --host http:\/\/localhost:3000 --keycloak-url http:\/\/localhost:8080\/realms\/db90/,
      );
    });

    it("defaults MCP (recommended) tab with npx insights init for claude-code", async () => {
      await goToSetupStep(claudeCodeProvider);
      const mcpTab = screen.getByRole("tab", { name: /MCP \(recommended\)/i });
      expect(mcpTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText(/Recommended MCP install command/i)).toHaveTextContent(
        /npx -y @aixle\/insights init --host http:\/\/localhost:3000 --keycloak-url http:\/\/localhost:8080\/realms\/db90/,
      );
    });

    it("offers a Stable/Staging channel selector and defaults to Stable on localhost", async () => {
      await goToSetupStep(claudeCodeProvider);
      const group = screen.getByRole("radiogroup", { name: /npm release channel/i });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Stable" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByRole("radio", { name: "Staging" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    it("switching to Staging changes the package spec in the init command", async () => {
      const user = userEvent.setup();
      await goToSetupStep(claudeCodeProvider);

      const command = () =>
        screen.getByLabelText(/Recommended MCP install command/i).textContent ?? "";

      expect(command()).toContain("npx -y @aixle/insights init");
      expect(command()).not.toContain("@aixle/insights@staging");

      await user.click(screen.getByRole("radio", { name: "Staging" }));
      expect(command()).toContain("npx -y @aixle/insights@staging init");

      await user.click(screen.getByRole("radio", { name: "Stable" }));
      expect(command()).toContain("npx -y @aixle/insights init");
      expect(command()).not.toContain("@aixle/insights@staging");
    });

    // Asserts the CURRENT phase: production is not live, so both channels target the
    // environment serving the sheet and differ only by npm package. When `stable` is
    // repointed at production this SHOULD fail — that is the signal to update the
    // production target, not a regression.
    it("keeps --host and --keycloak-url identical across channels (pre-production)", async () => {
      const user = userEvent.setup();
      await goToSetupStep(claudeCodeProvider);

      const flagsOf = () => {
        const text = screen.getByLabelText(/Recommended MCP install command/i).textContent ?? "";
        return text.slice(text.indexOf("--host"));
      };

      const stableFlags = flagsOf();
      await user.click(screen.getByRole("radio", { name: "Staging" }));
      expect(flagsOf()).toBe(stableFlags);
    });

    it("offers the channel selector on the cursor path too, without introducing tabs", async () => {
      await goToSetupStep(cursorProvider);
      expect(
        screen.getByRole("radiogroup", { name: /npm release channel/i }),
      ).toBeInTheDocument();
      // The cursor path deliberately has no MCP/hooks tabs; the channel control is a
      // radiogroup, not a Tabs list, so this must still hold.
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    });

    // AIX-618 QA feedback: production users always want the stable build, so the
    // choice is noise there. Removed outright rather than disabled — a disabled toggle
    // still makes the reader weigh a decision they don't have.
    describe("on production", () => {
      beforeEach(() => {
        channelEnv.selectable = false;
      });

      afterEach(() => {
        channelEnv.selectable = true;
      });

      it("hides the channel control and its explanatory copy on the claude-code path", async () => {
        await goToSetupStep(claudeCodeProvider);

        expect(
          screen.queryByRole("radiogroup", { name: /npm release channel/i }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: "Stable" })).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: "Staging" })).not.toBeInTheDocument();
        expect(screen.queryByText(/is what everyone runs/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/installs an unreleased QA build/i)).not.toBeInTheDocument();
      });

      it("hides the channel control on the cursor path too", async () => {
        await goToSetupStep(cursorProvider);
        expect(
          screen.queryByRole("radiogroup", { name: /npm release channel/i }),
        ).not.toBeInTheDocument();
      });

      // The point of hiding the control: what remains must still be a complete,
      // runnable setup path, and it must be the stable build.
      it("still shows the install instructions, the stable command and the copy button", async () => {
        await goToSetupStep(claudeCodeProvider);

        expect(screen.getByText(/One-time Keycloak device login/i)).toBeInTheDocument();

        const command = screen.getByLabelText(/Recommended MCP install command/i).textContent ?? "";
        expect(command).toContain("npx -y @aixle/insights init");
        expect(command).not.toContain("@aixle/insights@staging");
        expect(command).toContain("--host");
        expect(command).toContain("--keycloak-url");

        expect(screen.getAllByRole("button", { name: /copy/i }).length).toBeGreaterThan(0);
      });
    });

    it("does not offer a Standalone CLI tab for claude-code", async () => {
      await goToSetupStep(claudeCodeProvider);
      expect(screen.queryByRole("tab", { name: /Standalone CLI/i })).not.toBeInTheDocument();
    });

    it("shows ~/.claude/settings.json hook snippet on Advanced hooks tab", async () => {
      const user = userEvent.setup();
      await goToSetupStep(claudeCodeProvider);
      await user.click(screen.getByRole("tab", { name: /Advanced hooks/i }));
      expect(screen.getByText(/~\/.claude\/settings\.json/i)).toBeInTheDocument();
    });

    it("keeps the setup content in a scrollable container so tall tabs stay reachable", async () => {
      await goToSetupStep(claudeCodeProvider);
      const scrollContainer = screen.getByText("Your ingest token").closest(".overflow-y-auto");
      expect(scrollContainer).not.toBeNull();
      expect(scrollContainer).toHaveClass("flex-1");
    });

    it("gives setup tab triggers a natural height so wrapped tabs don't overlap content", async () => {
      await goToSetupStep(claudeCodeProvider);
      const advancedTab = screen.getByRole("tab", { name: /Advanced hooks/i });
      expect(advancedTab).toHaveClass("h-auto");
      expect(advancedTab).toHaveClass("flex-none");
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
