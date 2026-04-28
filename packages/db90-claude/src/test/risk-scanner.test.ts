import { describe, it, expect } from "vitest";
import { scanText } from "../risk-scanner.js";

describe("scanText", () => {
  it("returns low risk with zero score for empty string", () => {
    const result = scanText("");
    expect(result).toEqual({
      risk_level: "low",
      risk_score: 0,
      risk_categories: [],
      scannable: true,
    });
  });

  it("returns low risk for benign text", () => {
    const result = scanText("Hello, this is a normal message about coding.");
    expect(result.risk_level).toBe("low");
    expect(result.risk_score).toBe(0);
    expect(result.risk_categories).toEqual([]);
    expect(result.scannable).toBe(true);
  });

  it("detects GitHub token → high risk (score 3), secrets category", () => {
    const token = "ghp_" + "A".repeat(36);
    const result = scanText(`Please use token ${token} to authenticate`);
    expect(result.risk_level).toBe("high");
    expect(result.risk_score).toBe(3);
    expect(result.risk_categories).toContain("secrets");
    expect(result.scannable).toBe(true);
  });

  it("detects email only → medium risk, pii_standard category", () => {
    const result = scanText("Contact me at user@example.com for details");
    expect(result.risk_level).toBe("medium");
    expect(result.risk_categories).toContain("pii_standard");
    expect(result.risk_categories).not.toContain("secrets");
    expect(result.scannable).toBe(true);
  });

  it("detects SSN only → high risk (score 3), pii_high category", () => {
    const result = scanText("My SSN is 123-45-6789 please keep it safe");
    expect(result.risk_level).toBe("high");
    expect(result.risk_score).toBeGreaterThanOrEqual(3);
    expect(result.risk_categories).toContain("pii_high");
    expect(result.scannable).toBe(true);
  });

  it("detects AWS key + SSN → critical risk (score ≥ 5), both categories", () => {
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    const result = scanText(`AWS key: ${awsKey} and SSN: 987-65-4321`);
    expect(result.risk_level).toBe("critical");
    expect(result.risk_score).toBeGreaterThanOrEqual(5);
    expect(result.risk_categories).toContain("secrets");
    expect(result.risk_categories).toContain("pii_high");
    expect(result.scannable).toBe(true);
  });

  it("always returns scannable: true", () => {
    expect(scanText("").scannable).toBe(true);
    expect(scanText("some text").scannable).toBe(true);
    expect(scanText("user@example.com").scannable).toBe(true);
  });

  it("always returns an integer risk_score", () => {
    const cases = ["", "hello", "user@example.com", "123-45-6789", "ghp_" + "X".repeat(36)];
    for (const text of cases) {
      expect(Number.isInteger(scanText(text).risk_score)).toBe(true);
    }
  });

  it("detects phone number → medium risk, pii_standard category", () => {
    const result = scanText("Call me at 555-123-4567 anytime");
    expect(result.risk_level).toBe("medium");
    expect(result.risk_categories).toContain("pii_standard");
  });

  it("detects JWT → high risk (score 3), secrets category", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const result = scanText(`Authorization: Bearer ${jwt}`);
    expect(result.risk_level).toBe("high");
    expect(result.risk_score).toBe(3);
    expect(result.risk_categories).toContain("secrets");
  });
});
