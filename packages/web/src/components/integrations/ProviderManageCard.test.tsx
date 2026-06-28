import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderManageCard } from "./ProviderManageCard";
import type { ProviderInfo } from "@/lib/providers";

vi.mock("@/components/icons", () => ({
  ProviderLogo: ({ provider }: { provider: string }) => <span data-testid={`logo-${provider}`} />,
}));

const github: ProviderInfo = {
  id: "github",
  name: "GitHub",
  description: "Connect repositories",
  category: "code",
  scope: "project",
  features: [],
  available: true,
};

const figma: ProviderInfo = {
  id: "figma",
  name: "Figma",
  description: "Track AI features in Figma",
  category: "design",
  scope: "org",
  features: [],
  available: false,
  comingSoon: true,
};

describe("ProviderManageCard", () => {
  describe("enabled provider", () => {
    it("renders provider name and description", () => {
      render(<ProviderManageCard provider={github} enabled={true} onToggle={vi.fn()} />);
      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.getByText("Connect repositories")).toBeInTheDocument();
    });

    it("switch is checked when enabled", () => {
      render(<ProviderManageCard provider={github} enabled={true} onToggle={vi.fn()} />);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });

    it("switch is unchecked when disabled", () => {
      render(<ProviderManageCard provider={github} enabled={false} onToggle={vi.fn()} />);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    });

    it("calls onToggle with provider id and new value when toggled", async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();
      render(<ProviderManageCard provider={github} enabled={true} onToggle={onToggle} />);

      await user.click(screen.getByRole("switch"));

      expect(onToggle).toHaveBeenCalledWith("github", false);
    });

    it("switch is disabled while isPending", () => {
      render(<ProviderManageCard provider={github} enabled={true} onToggle={vi.fn()} isPending />);
      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("card has reduced opacity when provider is disabled", () => {
      const { container } = render(
        <ProviderManageCard provider={github} enabled={false} onToggle={vi.fn()} />
      );
      expect(container.firstChild).toHaveClass("opacity-60");
    });

    it("aria-label reflects current enabled state", () => {
      const { rerender } = render(
        <ProviderManageCard provider={github} enabled={true} onToggle={vi.fn()} />
      );
      expect(screen.getByRole("switch")).toHaveAccessibleName("Disable GitHub");

      rerender(<ProviderManageCard provider={github} enabled={false} onToggle={vi.fn()} />);
      expect(screen.getByRole("switch")).toHaveAccessibleName("Enable GitHub");
    });
  });

  describe("comingSoon provider", () => {
    it("shows Coming Soon badge", () => {
      render(<ProviderManageCard provider={figma} enabled={true} onToggle={vi.fn()} />);
      expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    });

    it("switch is always checked and disabled for comingSoon providers", () => {
      render(<ProviderManageCard provider={figma} enabled={false} onToggle={vi.fn()} />);
      const sw = screen.getByRole("switch");
      expect(sw).toHaveAttribute("aria-checked", "true");
      expect(sw).toBeDisabled();
    });

    it("has a coming-soon aria-label instead of enable/disable", () => {
      render(<ProviderManageCard provider={figma} enabled={false} onToggle={vi.fn()} />);
      expect(screen.getByRole("switch")).toHaveAccessibleName("Figma — coming soon");
    });

    it("does not call onToggle when comingSoon switch is clicked", async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();
      render(<ProviderManageCard provider={figma} enabled={true} onToggle={onToggle} />);

      await user.click(screen.getByRole("switch"));

      expect(onToggle).not.toHaveBeenCalled();
    });
  });
});
