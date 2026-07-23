import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { RangeSegmentedControl } from "./RangeSegmentedControl";

const OPTIONS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
] as const;

describe("RangeSegmentedControl (AIX-604)", () => {
  it("marks the active option with data-state=active", () => {
    render(
      <RangeSegmentedControl value="30d" options={OPTIONS} onChange={() => {}} />
    );

    expect(screen.getByRole("tab", { name: "30d" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "7d" })).toHaveAttribute(
      "data-state",
      "inactive"
    );
  });

  it("calls onChange when a different option is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RangeSegmentedControl value="30d" options={OPTIONS} onChange={onChange} />
    );

    await user.click(screen.getByRole("tab", { name: "7d" }));
    expect(onChange).toHaveBeenCalledWith("7d");
  });
});
