import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { MetricCard, MetricGrid } from "./MetricCard";

describe("MetricCard", () => {
  describe("label rendering", () => {
    it("renders label prop as the card heading", () => {
      render(<MetricCard label="Total Events" value={1234} />);
      expect(screen.getByText("Total Events")).toBeInTheDocument();
    });

    it("renders legacy title prop as fallback heading", () => {
      render(<MetricCard title="Total Cost" value={99} />);
      expect(screen.getByText("Total Cost")).toBeInTheDocument();
    });

    it("prefers label over title when both are provided", () => {
      render(<MetricCard label="New Label" title="Old Title" value={0} />);
      expect(screen.getByText("New Label")).toBeInTheDocument();
      expect(screen.queryByText("Old Title")).not.toBeInTheDocument();
    });
  });

  describe("value formatting", () => {
    it("formats number values with locale separators by default", () => {
      render(<MetricCard label="Events" value={1234567} />);
      expect(screen.getByText("1,234,567")).toBeInTheDocument();
    });

    it("formats currency values with $ sign and 0 decimal places", () => {
      render(<MetricCard label="Cost" value={4200} format="currency" />);
      expect(screen.getByText("$4,200")).toBeInTheDocument();
    });

    it("formats compact values with K suffix", () => {
      render(<MetricCard label="Tokens" value={125000} format="compact" />);
      expect(screen.getByText("125.0K")).toBeInTheDocument();
    });

    it("formats compact values with M suffix", () => {
      render(<MetricCard label="Tokens" value={1_500_000} format="compact" />);
      expect(screen.getByText("1.5M")).toBeInTheDocument();
    });

    it("renders string values as-is", () => {
      render(<MetricCard label="Tool" value="Claude Code" />);
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });
  });

  describe("delta prop", () => {
    it("renders delta text when provided", () => {
      render(<MetricCard label="Events" value={100} delta="+10% vs last month" trend="up" />);
      expect(screen.getByText("+10% vs last month")).toBeInTheDocument();
    });

    it("renders legacy trendValue as fallback delta", () => {
      render(<MetricCard label="Events" value={100} trendValue="5%" trend="up" />);
      expect(screen.getByText("5%")).toBeInTheDocument();
    });

    it("prefers delta over trendValue when both provided", () => {
      render(
        <MetricCard label="Events" value={100} delta="+10% new" trendValue="5% old" trend="up" />
      );
      expect(screen.getByText("+10% new")).toBeInTheDocument();
      expect(screen.queryByText("5% old")).not.toBeInTheDocument();
    });

    it("renders nothing in the delta slot when neither delta nor trendValue provided", () => {
      render(<MetricCard label="Events" value={100} />);
      // The trend span only appears when resolvedDelta is truthy
      expect(screen.queryByText(/[+\-±%]/)).not.toBeInTheDocument();
    });

    it("renders delta text even when trend is omitted (defaults to Minus/muted)", () => {
      render(<MetricCard label="Events" value={100} delta="±0%" />);
      const deltaEl = screen.getByText("±0%").closest("span");
      expect(deltaEl).toHaveClass("text-muted-foreground");
    });
  });

  describe("subtitle prop", () => {
    it("renders subtitle text when provided", () => {
      render(<MetricCard label="Events" value={100} subtitle="This month" />);
      expect(screen.getByText("This month")).toBeInTheDocument();
    });

    it("renders legacy description prop as fallback subtitle", () => {
      render(<MetricCard label="Events" value={100} description="All time" />);
      expect(screen.getByText("All time")).toBeInTheDocument();
    });

    it("renders nothing when neither subtitle nor description provided", () => {
      render(<MetricCard label="Events" value={100} />);
      expect(screen.queryByText("This month")).not.toBeInTheDocument();
      expect(screen.queryByText("All time")).not.toBeInTheDocument();
    });
  });

  describe("trend colors", () => {
    it("applies success color class for up trend", () => {
      render(<MetricCard label="x" value={1} delta="+5%" trend="up" />);
      expect(screen.getByText("+5%").closest("span")).toHaveClass("text-success");
    });

    it("applies destructive color class for down trend", () => {
      render(<MetricCard label="x" value={1} delta="-5%" trend="down" />);
      expect(screen.getByText("-5%").closest("span")).toHaveClass("text-destructive");
    });

    it("applies muted color class for neutral trend", () => {
      render(<MetricCard label="x" value={1} delta="0%" trend="neutral" />);
      expect(screen.getByText("0%").closest("span")).toHaveClass("text-muted-foreground");
    });
  });
});

describe("MetricGrid", () => {
  it("renders children inside a responsive grid container", () => {
    const { container } = render(
      <MetricGrid>
        <MetricCard label="A" value={1} />
        <MetricCard label="B" value={2} />
      </MetricGrid>
    );
    expect(container.firstChild).toHaveClass("grid");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
