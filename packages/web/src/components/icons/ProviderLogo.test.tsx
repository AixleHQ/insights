import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProviderLogo } from "./ProviderLogo";

describe("ProviderLogo", () => {
  it("keeps the icon from being compressed in a flex row (background variant)", () => {
    const { container } = render(<ProviderLogo provider="github" showBackground />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("shrink-0");
  });

  it("keeps the bare image from being compressed in a flex row", () => {
    const { container } = render(<ProviderLogo provider="github" />);
    const img = container.querySelector("img");
    expect(img?.className).toContain("shrink-0");
  });

  it("keeps the fallback initial from being compressed in a flex row", () => {
    const { container } = render(<ProviderLogo provider="unknown-provider" />);
    const fallback = container.firstElementChild;
    expect(fallback?.className).toContain("shrink-0");
  });
});
