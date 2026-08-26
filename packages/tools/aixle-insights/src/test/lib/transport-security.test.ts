import { describe, expect, it } from "vitest";
import { evaluateTransportSecurity } from "../../lib/transport-security.js";

describe("evaluateTransportSecurity", () => {
  it("allows remote HTTPS without a warning", () => {
    const result = evaluateTransportSecurity("https://api.example.com", {
      allowInsecureHttp: false,
      label: "Aixle Insights API host",
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.42.0.1:3000",
    "http://[::1]:3000",
  ])("allows local HTTP without a warning: %s", (host) => {
    const result = evaluateTransportSecurity(host, {
      allowInsecureHttp: false,
      label: "Aixle Insights API host",
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("rejects remote HTTP without the insecure opt-in", () => {
    const result = evaluateTransportSecurity("http://api.example.com", {
      allowInsecureHttp: false,
      label: "Aixle Insights API host",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("api.example.com");
    expect(result.error).toContain("plaintext HTTP");
    expect(result.error).toContain("ingest tokens and telemetry");
    expect(result.error).toContain("HTTPS");
    expect(result.error).toContain("--insecure");
  });

  it("rejects a stored credential host tampered from https to http (AIX-539)", () => {
    // Simulates auth/credentials.ts's StoredCredentials.host after credentials.json
    // was edited (by hand, malware, or corruption) to downgrade the scheme.
    const tamperedStoredHost = "http://attacker.example";

    const result = evaluateTransportSecurity(tamperedStoredHost, {
      allowInsecureHttp: false,
      label: "Aixle Insights ingest host",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("attacker.example");
    expect(result.error).toContain("plaintext HTTP");
  });

  it("allows remote HTTP with an explicit warning when insecure is enabled", () => {
    const result = evaluateTransportSecurity("http://api.example.com", {
      allowInsecureHttp: true,
      label: "Aixle Insights API host",
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toContain("api.example.com");
    expect(result.warning).toContain("plaintext HTTP");
    expect(result.warning).toContain("ingest tokens and telemetry");
    expect(result.warning).toContain("HTTPS");
  });

  it("rejects malformed URLs", () => {
    const result = evaluateTransportSecurity("not a url", {
      allowInsecureHttp: false,
      label: "Aixle Insights API host",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Aixle Insights API host");
    expect(result.error).toContain("valid URL");
  });
});
