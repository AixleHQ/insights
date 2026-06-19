import { describe, it, expect } from "vitest";
import { normalizeRiskLevel } from "./riskLevel";

describe("normalizeRiskLevel", () => {
  it.each(["critical", "high", "medium", "low", "none"] as const)(
    "returns %s for known levels",
    (level) => {
      expect(normalizeRiskLevel(level)).toBe(level);
    }
  );

  it("maps unknown values to none", () => {
    expect(normalizeRiskLevel("invalid")).toBe("none");
    expect(normalizeRiskLevel("")).toBe("none");
    expect(normalizeRiskLevel(undefined)).toBe("none");
    expect(normalizeRiskLevel(null)).toBe("none");
  });
});
