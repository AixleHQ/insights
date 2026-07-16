import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { RiskBadge } from "./risk-badge";

const riskLabels = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
} as const;

describe("RiskBadge", () => {
  it.each([
    ["critical", "text-risk-critical", "border-risk-critical/30"],
    ["high", "text-risk-high", "border-risk-high/30"],
    ["medium", "text-risk-medium", "border-risk-medium/30"],
    ["low", "text-risk-low", "border-risk-low/30"],
    ["none", "text-muted-foreground", "border-border"],
  ] as const)("renders %s badge with icon and label", (level, textClass, borderClass) => {
    render(<RiskBadge level={level} />);

    const label = riskLabels[level];
    expect(screen.getByText(label)).toBeInTheDocument();

    const badge = screen.getByText(label).closest("span");
    expect(badge).toHaveClass(textClass, borderClass);
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<RiskBadge level="high" className="ml-2" />);
    const badge = screen.getByText("High").closest("span");
    expect(badge).toHaveClass("ml-2");
  });
});
