import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntegrationCard, type IntegrationData, type ProviderInfo } from "./IntegrationCard";

const baseIntegration: IntegrationData = {
  id: "conn-1",
  provider: "anthropic",
  name: "Anthropic API",
  status: "connected",
};

const anthropicProvider: ProviderInfo = {
  id: "anthropic",
  name: "Anthropic API",
  description: "Direct Anthropic API integration",
  category: "ai",
  scope: "org",
  features: ["API key management", "Usage monitoring", "Cost tracking"],
  available: true,
};

describe("IntegrationCard — connected integration", () => {
  describe("last_sync_at display", () => {
    it("shows last sync time when last_sync_at is present", () => {
      const integration: IntegrationData = {
        ...baseIntegration,
        last_sync_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      };
      render(<IntegrationCard integration={integration} />);
      expect(screen.getByText(/last synced/i)).toBeInTheDocument();
    });

    it("does not show last sync row when last_sync_at is absent", () => {
      render(<IntegrationCard integration={baseIntegration} />);
      expect(screen.queryByText(/last synced/i)).not.toBeInTheDocument();
    });

    it("shows synced event metadata when present", () => {
      render(
        <IntegrationCard
          integration={{
            ...baseIntegration,
            metadata: { resources_count: 3, event_count: 27 },
            last_event_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          }}
        />
      );

      expect(screen.getByText(/27 synced events/i)).toBeInTheDocument();
      expect(screen.getByText(/3 resources/i)).toBeInTheDocument();
    });
  });

  describe("status badge", () => {
    it("shows Connected badge for connected status", () => {
      render(<IntegrationCard integration={{ ...baseIntegration, status: "connected" }} />);
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("shows Error badge for error status", () => {
      render(<IntegrationCard integration={{ ...baseIntegration, status: "error" }} />);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    it("shows Disconnected badge for disconnected status", () => {
      render(<IntegrationCard integration={{ ...baseIntegration, status: "disconnected" }} />);
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    it("shows Testing… badge when isTesting is true", () => {
      render(<IntegrationCard integration={baseIntegration} isTesting />);
      expect(screen.getByText("Testing…")).toBeInTheDocument();
    });

    it("shows Syncing… badge for testing status outside explicit test flow", () => {
      render(<IntegrationCard integration={{ ...baseIntegration, status: "testing" }} />);
      expect(screen.getByText("Syncing…")).toBeInTheDocument();
      expect(screen.queryByText("Testing…")).not.toBeInTheDocument();
    });

    it("does not show Connected badge while testing", () => {
      render(<IntegrationCard integration={baseIntegration} isTesting />);
      expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });
  });

  describe("error panel", () => {
    it("shows collapsed error panel when sync_error is present", () => {
      const integration: IntegrationData = {
        ...baseIntegration,
        status: "error",
        sync_error: "API key expired",
      };
      render(<IntegrationCard integration={integration} />);
      expect(screen.getByText(/last error/i)).toBeInTheDocument();
    });

    it("does not show error panel when sync_error is absent", () => {
      render(<IntegrationCard integration={baseIntegration} />);
      expect(screen.queryByText(/last error/i)).not.toBeInTheDocument();
    });

    it("expands to show error message when header is clicked", async () => {
      const user = userEvent.setup();
      const integration: IntegrationData = {
        ...baseIntegration,
        status: "error",
        sync_error: "API key expired — please rotate",
      };
      render(<IntegrationCard integration={integration} />);

      await user.click(screen.getByRole("button", { name: /last error/i }));

      expect(screen.getByText("API key expired — please rotate")).toBeInTheDocument();
    });

    it("collapses error message when clicked again", async () => {
      const user = userEvent.setup();
      const integration: IntegrationData = {
        ...baseIntegration,
        status: "error",
        sync_error: "Connection refused",
      };
      render(<IntegrationCard integration={integration} />);

      const toggle = screen.getByRole("button", { name: /last error/i });
      await user.click(toggle); // expand
      expect(screen.getByText("Connection refused")).toBeInTheDocument();

      await user.click(toggle); // collapse
      expect(screen.queryByText("Connection refused")).not.toBeInTheDocument();
    });
  });

  describe("test connection menu item", () => {
    it("shows Test connection when onTest is provided", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard integration={baseIntegration} onTest={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));

      expect(screen.getByRole("menuitem", { name: /test connection/i })).toBeInTheDocument();
    });

    it("does not show Test connection when onTest is not provided", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard integration={baseIntegration} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));

      expect(screen.queryByRole("menuitem", { name: /test connection/i })).not.toBeInTheDocument();
    });

    it("calls onTest with integration id when clicked", async () => {
      const user = userEvent.setup();
      const onTest = vi.fn();
      render(<IntegrationCard integration={baseIntegration} onTest={onTest} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /test connection/i }));

      expect(onTest).toHaveBeenCalledWith("conn-1");
    });

    it("disables Test connection when isTesting is true", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard integration={baseIntegration} onTest={vi.fn()} isTesting />);

      await user.click(screen.getByRole("button", { name: /actions/i }));

      expect(screen.getByRole("menuitem", { name: /test connection/i })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
    });
  });

  describe("disconnect menu item", () => {
    it("calls onDisconnect with integration id", async () => {
      const user = userEvent.setup();
      const onDisconnect = vi.fn();
      render(<IntegrationCard integration={baseIntegration} onDisconnect={onDisconnect} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /disconnect/i }));

      expect(onDisconnect).toHaveBeenCalledWith("conn-1");
    });
  });

  describe("rename menu item", () => {
    it("shows Rename when onRename is provided", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard integration={baseIntegration} onRename={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      expect(screen.getByRole("menuitem", { name: /rename/i })).toBeInTheDocument();
    });

    it("does not show Rename when onRename is not provided", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard integration={baseIntegration} onDisconnect={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      expect(screen.queryByRole("menuitem", { name: /rename/i })).not.toBeInTheDocument();
    });

    it("opens dialog pre-filled with current label on Rename click", async () => {
      const user = userEvent.setup();
      const integration: IntegrationData = { ...baseIntegration, label: "My label" };
      render(<IntegrationCard integration={integration} onRename={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /rename/i }));

      expect(screen.getByRole("dialog", { name: /rename/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/label/i)).toHaveValue("My label");
    });

    it("calls onRename with connector id and new label on Save", async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      render(<IntegrationCard integration={baseIntegration} onRename={onRename} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /rename/i }));

      await user.clear(screen.getByLabelText(/label/i));
      await user.type(screen.getByLabelText(/label/i), "New name");
      await user.click(screen.getByRole("button", { name: /save/i }));

      expect(onRename).toHaveBeenCalledWith("conn-1", "New name");
    });

    it("closes dialog on Cancel without calling onRename", async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      render(<IntegrationCard integration={baseIntegration} onRename={onRename} />);

      await user.click(screen.getByRole("button", { name: /actions/i }));
      await user.click(screen.getByRole("menuitem", { name: /rename/i }));
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

describe("IntegrationCard — available provider", () => {
  it("renders provider name and description", () => {
    render(<IntegrationCard provider={anthropicProvider} />);
    expect(screen.getByText("Anthropic API")).toBeInTheDocument();
    expect(screen.getByText("Direct Anthropic API integration")).toBeInTheDocument();
  });

  it("shows Connect button for available provider", () => {
    render(<IntegrationCard provider={anthropicProvider} />);
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeEnabled();
  });

  it("shows Coming Soon button for unavailable provider", () => {
    render(<IntegrationCard provider={{ ...anthropicProvider, available: false }} />);
    expect(screen.getByRole("button", { name: /coming soon/i })).toBeDisabled();
  });

  it("calls onConnect with provider id when Connect is clicked", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    render(<IntegrationCard provider={anthropicProvider} onConnect={onConnect} />);

    await user.click(screen.getByRole("button", { name: /^connect$/i }));

    expect(onConnect).toHaveBeenCalledWith("anthropic");
  });

  it("lists up to 3 features", () => {
    render(<IntegrationCard provider={anthropicProvider} />);
    expect(screen.getByText("API key management")).toBeInTheDocument();
    expect(screen.getByText("Usage monitoring")).toBeInTheDocument();
    expect(screen.getByText("Cost tracking")).toBeInTheDocument();
  });

  it("returns null when no provider or integration is given", () => {
    const { container } = render(<IntegrationCard />);
    expect(container.firstChild).toBeNull();
  });
});

describe("IntegrationCard — label display", () => {
  it("renders label when present on connected integration", () => {
    const integration: IntegrationData = {
      ...baseIntegration,
      provider: "github",
      name: "GitHub",
      label: "Work account",
    };
    render(<IntegrationCard integration={integration} />);
    expect(screen.getByText(/Work account/)).toBeInTheDocument();
  });

  it("renders account_name when label is absent", () => {
    const integration: IntegrationData = {
      ...baseIntegration,
      provider: "github",
      name: "GitHub",
      metadata: { account_name: "my-org" },
    };
    render(<IntegrationCard integration={integration} />);
    expect(screen.getByText(/my-org/)).toBeInTheDocument();
  });

  it("prefers label over account_name when both are present", () => {
    const integration: IntegrationData = {
      ...baseIntegration,
      provider: "github",
      name: "GitHub",
      label: "Primary org",
      metadata: { account_name: "secondary-name" },
    };
    render(<IntegrationCard integration={integration} />);
    expect(screen.getByText(/Primary org/)).toBeInTheDocument();
    expect(screen.queryByText(/secondary-name/)).not.toBeInTheDocument();
  });
});
