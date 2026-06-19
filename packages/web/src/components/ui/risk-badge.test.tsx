import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { RiskBadge } from "./risk-badge";

describe("RiskBadge", () => {
  it("renders nothing for none", () => {
    const { container } = render(<RiskBadge level="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["critical", "text-risk-critical", "bg-risk-critical"],
    ["high", "text-risk-high", "bg-risk-high"],
    ["medium", "text-risk-medium", "bg-risk-medium"],
    ["low", "text-risk-low", "bg-risk-low"],
  ] as const)("renders %s badge with dot and label", (level, textClass, dotClass) => {
    render(<RiskBadge level={level} />);

    expect(screen.getByText(level)).toBeInTheDocument();

    const badge = screen.getByText(level).closest("[data-slot='badge']");
    expect(badge).toHaveClass(textClass);

    const dot = badge?.querySelector("span.rounded-full");
    expect(dot).toHaveClass("size-1.5", dotClass);
  });

  it("merges custom className", () => {
    render(<RiskBadge level="high" className="ml-2" />);
    const badge = screen.getByText("high").closest("[data-slot='badge']");
    expect(badge).toHaveClass("ml-2");
  });
});
