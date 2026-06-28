import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { RiskBadge } from "./risk-badge";

describe("RiskBadge", () => {
  it("renders the None icon and label for none", () => {
    const { container } = render(<RiskBadge level="none" />);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it.each([
    ["critical", "Critical"],
    ["high",     "High"],
    ["medium",   "Medium"],
    ["low",      "Low"],
  ] as const)("renders %s badge with icon and sentence-case label", (level, label) => {
    render(<RiskBadge level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("merges custom className", () => {
    const { container } = render(<RiskBadge level="high" className="ml-2" />);
    expect(container.firstChild).toHaveClass("ml-2");
  });
});
