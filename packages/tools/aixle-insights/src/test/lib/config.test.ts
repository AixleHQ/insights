import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBaseConfig } from "../../lib/config.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "db90-sdk-config-test-"));
  // Point mcpLog at the sandbox: rejected-shape cases below now emit a warn (AIX-699), and
  // without this the suite appends to the developer's real ~/.aixle-insights/mcp.log.
  process.env.AIXLE_INSIGHTS_HOME = testDir;
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  delete process.env.AIXLE_INSIGHTS_HOME;
});

describe("loadBaseConfig — happy path", () => {
  it("returns parsed token/host/project_id", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({
        token: "my-token",
        host: "https://example.com",
        project_id: "proj-uuid",
      })
    );
    const result = loadBaseConfig(testDir);
    expect(result.token).toBe("my-token");
    expect(result.host).toBe("https://example.com");
    expect(result.project_id).toBe("proj-uuid");
  });

  it("ignores non-string token/host/project_id values (type-guarded)", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ token: 42, host: true, project_id: null })
    );
    const result = loadBaseConfig(testDir);
    expect(result.token).toBeUndefined();
    expect(result.host).toBeUndefined();
    expect(result.project_id).toBeUndefined();
  });
});

describe("loadBaseConfig — missing/invalid files", () => {
  it("returns empty object when config.json does not exist", () => {
    expect(loadBaseConfig(testDir)).toEqual({});
  });

  it("returns empty object when config.json is malformed JSON", () => {
    writeFileSync(join(testDir, "config.json"), "{not json");
    expect(loadBaseConfig(testDir)).toEqual({});
  });

  it("returns empty object when config.json is not an object", () => {
    writeFileSync(join(testDir, "config.json"), JSON.stringify([1, 2, 3]));
    expect(loadBaseConfig(testDir)).toEqual({});
  });

  it("returns empty object when config.json parses to null", () => {
    writeFileSync(join(testDir, "config.json"), "null");
    expect(loadBaseConfig(testDir)).toEqual({});
  });
});

describe("loadBaseConfig — parsePricing extension point", () => {
  it("invokes parsePricing with the raw object and attaches the result", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({
        token: "tok",
        pricing: { rate_per_token: 0.01 },
      })
    );
    const parsePricing = (raw: Record<string, unknown>): { rate_per_token: number } | undefined => {
      const p = raw.pricing as Record<string, unknown> | undefined;
      if (!p || typeof p.rate_per_token !== "number") return undefined;
      return { rate_per_token: p.rate_per_token };
    };
    const result = loadBaseConfig(testDir, parsePricing);
    expect(result.pricing).toEqual({ rate_per_token: 0.01 });
  });

  it("omits pricing when parsePricing returns undefined", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ token: "tok", pricing: "invalid" })
    );
    const parsePricing = () => undefined;
    const result = loadBaseConfig(testDir, parsePricing);
    expect(result.token).toBe("tok");
    expect("pricing" in result).toBe(false);
  });

  it("does not crash when parsePricing is not provided and pricing key is present", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ token: "tok", pricing: { some_field: 1 } })
    );
    const result = loadBaseConfig(testDir);
    expect(result.token).toBe("tok");
    expect("pricing" in result).toBe(false);
  });
});

describe("loadBaseConfig — security", () => {
  it("__proto__ key in config does not pollute Object.prototype", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ "__proto__": { "polluted": true }, token: "tok" })
    );
    loadBaseConfig(testDir);
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>)["polluted"];
  });
});
