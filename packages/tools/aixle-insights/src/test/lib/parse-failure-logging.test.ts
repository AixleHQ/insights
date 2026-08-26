import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const keytarState = vi.hoisted(() => ({ store: new Map<string, string>(), getPasswordThrows: false }));

vi.mock("keytar", () => ({
  default: {
    getPassword: async (s: string, a: string) => {
      if (keytarState.getPasswordThrows) throw new Error("keychain locked");
      return keytarState.store.get(`${s}:${a}`) ?? null;
    },
    setPassword: async (s: string, a: string, p: string) => {
      keytarState.store.set(`${s}:${a}`, p);
    },
    deletePassword: async (s: string, a: string) => {
      keytarState.store.delete(`${s}:${a}`);
    },
  },
}));

import { KEYTAR_SERVICE, loadCredentials, loadCredentialsFromFileOnly } from "../../auth/credentials.js";
import { loadBaseConfig } from "../../lib/config.js";
import { readState } from "../../state.js";
import { mcpLog } from "../../log.js";

describe("parse-failure logging — corrupt file distinguishable from absent file", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "db90-parse-failure-test-"));
    process.env.AIXLE_INSIGHTS_HOME = testDir;
    keytarState.store.clear();
    keytarState.getPasswordThrows = false;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.AIXLE_INSIGHTS_HOME;
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    keytarState.store.clear();
    keytarState.getPasswordThrows = false;
  });

  describe("auth/credentials.ts — loadCredentialsFromFileOnly", () => {
    it("absent file: no warn, returns null", () => {
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("corrupt file: warns with path (no contents), still returns null", () => {
      writeFileSync(join(testDir, "credentials.json"), "{not json");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_parse_failed",
        expect.objectContaining({
          path: expect.stringContaining("credentials.json"),
          reason: "invalid_json",
        }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("not json");
    });

    // Regression for a PR review finding: V8's JSON.parse SyntaxError embeds a prefix of the
    // raw input in its message, so a secret-shaped corrupt file must not have that message
    // logged verbatim — `{not json` doesn't trigger this class of leak, a token-shaped payload
    // that fails to parse as an object does.
    it("corrupt file shaped like a live secret: error field is a safe code, never the message", () => {
      writeFileSync(join(testDir, "credentials.json"), "example_local_fixture_1234567890");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_parse_failed",
        expect.objectContaining({ reason: "invalid_json", error: "SyntaxError" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("example_");
    });

    // AIX-699 — valid JSON that normalizeLoadedCredentials rejects was previously silent,
    // making a plausible-looking replacement file indistinguishable from an absent one.
    it.each([
      ["unknown keys", '{"foo":1}'],
      ["empty object", "{}"],
      ["v2 missing host", '{"version":2,"accounts":{"cursor":"tok"}}'],
      ["v2 with no usable token", '{"version":2,"host":"https://x.test","accounts":{}}'],
      ["v1 host without token", '{"host":"https://x.test"}'],
      ["JSON scalar", '"just-a-string"'],
      ["JSON array", "[1,2,3]"],
    ])("valid JSON, invalid shape (%s): warns, returns null", (_label, body) => {
      writeFileSync(join(testDir, "credentials.json"), body);
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_parse_failed",
        expect.objectContaining({
          path: expect.stringContaining("credentials.json"),
          reason: "invalid_shape",
        }),
        false,
      );
    });

    it("invalid shape: log fields carry no file contents", () => {
      writeFileSync(
        join(testDir, "credentials.json"),
        JSON.stringify({ foo: 1, leaked: "super-secret-token-value" }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)).toBeNull();
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("super-secret-token-value");
    });

    it("valid credentials: loads with no warn (no false positives)", () => {
      writeFileSync(
        join(testDir, "credentials.json"),
        JSON.stringify({ version: 2, host: "https://x.test", accounts: { cursor: "tok" } }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)?.host).toBe("https://x.test");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("valid legacy v1 credentials: loads with no warn", () => {
      writeFileSync(
        join(testDir, "credentials.json"),
        JSON.stringify({ host: "https://x.test", token: "tok" }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadCredentialsFromFileOnly(testDir)?.accounts.claude_code).toBe("tok");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("auth/credentials.ts — tryKeytarGet (via loadCredentials)", () => {
    beforeEach(() => {
      delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    });

    it("no keychain entry: no warn, returns null", async () => {
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(await loadCredentials(testDir)).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("keytar unavailable: no warn, returns null (falls back to file)", async () => {
      keytarState.getPasswordThrows = true;
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(await loadCredentials(testDir)).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("corrupt keychain entry: warns, still returns null", async () => {
      keytarState.store.set(`${KEYTAR_SERVICE}:aixle-insights-ingest-credential`, "{not json");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(await loadCredentials(testDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_keytar_parse_failed",
        expect.objectContaining({ keytarService: KEYTAR_SERVICE, reason: "invalid_json" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("not json");
    });

    it("corrupt keychain entry shaped like a live secret: error field is a safe code, never the message", async () => {
      keytarState.store.set(
        `${KEYTAR_SERVICE}:aixle-insights-ingest-credential`,
        "example_local_fixture_1234567890",
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(await loadCredentials(testDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_keytar_parse_failed",
        expect.objectContaining({ keytarService: KEYTAR_SERVICE, reason: "invalid_json", error: "SyntaxError" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("example_");
    });

    it("bad keychain entry recovers via a valid credentials.json fallback", async () => {
      keytarState.store.set(`${KEYTAR_SERVICE}:aixle-insights-ingest-credential`, JSON.stringify({ foo: 1 }));
      writeFileSync(
        join(testDir, "credentials.json"),
        JSON.stringify({ version: 2, host: "https://x.test", accounts: { cursor: "tok" } }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      const creds = await loadCredentials(testDir);
      expect(creds?.host).toBe("https://x.test");
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_keytar_parse_failed",
        expect.objectContaining({ reason: "invalid_shape" }),
        false,
      );
      // The keytar rejection must not also mark the (valid) file as a parse failure.
      expect(warnSpy).not.toHaveBeenCalledWith("credentials_parse_failed", expect.anything(), expect.anything());
    });

    // AIX-699. testDir deliberately has no credentials.json: loadCredentials is keychain-first
    // (AIX-336), so a file on disk would add a shadow/parse warn and shift the call indices.
    it("keychain entry valid JSON, invalid shape: warns, returns null", async () => {
      keytarState.store.set(
        `${KEYTAR_SERVICE}:aixle-insights-ingest-credential`,
        JSON.stringify({ foo: 1, leaked: "super-secret-token-value" }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(await loadCredentials(testDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        "credentials_keytar_parse_failed",
        expect.objectContaining({ keytarService: KEYTAR_SERVICE, reason: "invalid_shape" }),
        false,
      );
      const allFields = JSON.stringify(warnSpy.mock.calls.map((c) => c[1]));
      expect(allFields).not.toContain("super-secret-token-value");
      // Never leak the payload by echoing a filesystem path for a keychain-sourced failure.
      expect(allFields).not.toContain("credentials.json");
    });

    it("valid keychain entry: loads with no warn (no false positives)", async () => {
      keytarState.store.set(
        `${KEYTAR_SERVICE}:aixle-insights-ingest-credential`,
        JSON.stringify({ version: 2, host: "https://x.test", accounts: { cursor: "tok" } }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect((await loadCredentials(testDir))?.host).toBe("https://x.test");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("keytar disabled: invalid-shape keychain entry is not consulted", async () => {
      process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "1";
      keytarState.store.set(
        `${KEYTAR_SERVICE}:aixle-insights-ingest-credential`,
        JSON.stringify({ foo: 1 }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(await loadCredentials(testDir)).toBeNull();
      // The keychain is never consulted, so no keytar event may fire.
      expect(warnSpy).not.toHaveBeenCalledWith(
        "credentials_keytar_parse_failed",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("lib/config.ts — loadBaseConfig", () => {
    it("absent file: no warn, returns {}", () => {
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadBaseConfig(testDir)).toEqual({});
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("corrupt file: warns with path (no contents), still returns {}", () => {
      writeFileSync(join(testDir, "config.json"), "{not json");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadBaseConfig(testDir)).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(
        "config_parse_failed",
        expect.objectContaining({ path: expect.stringContaining("config.json"), reason: "invalid_json" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("not json");
    });

    it("corrupt file shaped like a live secret: error field is a safe code, never the message", () => {
      writeFileSync(join(testDir, "config.json"), "example_local_fixture_1234567890");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadBaseConfig(testDir)).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(
        "config_parse_failed",
        expect.objectContaining({ reason: "invalid_json", error: "SyntaxError" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("example_");
    });

    // AIX-699. The array case matters most: `typeof [] === "object"` previously let arrays
    // through to the happy path and into parsePricing.
    it.each([
      ["array", "[1,2,3]"],
      ["scalar string", '"nope"'],
      ["number", "42"],
      ["null", "null"],
    ])("valid JSON, invalid shape (%s): warns, returns {}", (_label, body) => {
      writeFileSync(join(testDir, "config.json"), body);
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadBaseConfig(testDir)).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(
        "config_parse_failed",
        expect.objectContaining({ path: expect.stringContaining("config.json"), reason: "invalid_shape" }),
        false,
      );
    });

    it("invalid shape: parsePricing is never invoked", () => {
      writeFileSync(join(testDir, "config.json"), "[1,2,3]");
      const parsePricing = vi.fn(() => ({ rate: 1 }));
      expect(loadBaseConfig(testDir, parsePricing)).toEqual({});
      expect(parsePricing).not.toHaveBeenCalled();
    });

    it("valid config: loads with no warn (no false positives)", () => {
      writeFileSync(join(testDir, "config.json"), JSON.stringify({ host: "https://x.test" }));
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(loadBaseConfig(testDir).host).toBe("https://x.test");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("state.ts — readState", () => {
    it("absent file: no warn, returns default state", () => {
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(readState(testDir)).toEqual({ version: 1, sessions: {} });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("corrupt file: warns with path (no contents), still returns default state", () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, "state.json"), "{not json");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(readState(testDir)).toEqual({ version: 1, sessions: {} });
      expect(warnSpy).toHaveBeenCalledWith(
        "state_parse_failed",
        expect.objectContaining({ path: expect.stringContaining("state.json"), reason: "invalid_json" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("not json");
    });

    it("corrupt file shaped like a live secret: error field is a safe code, never the message", () => {
      writeFileSync(join(testDir, "state.json"), "example_local_fixture_1234567890");
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(readState(testDir)).toEqual({ version: 1, sessions: {} });
      expect(warnSpy).toHaveBeenCalledWith(
        "state_parse_failed",
        expect.objectContaining({ reason: "invalid_json", error: "SyntaxError" }),
        false,
      );
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("example_");
    });

    // AIX-699. Highest-impact of the four: this fallback silently discards every dedup
    // checkpoint, so the next sync re-sends everything.
    it.each([
      ["unknown keys", '{"foo":"bar"}'],
      ["empty object", "{}"],
      ["version not a number", '{"version":"1","sessions":{}}'],
      ["sessions missing", '{"version":1}'],
      ["sessions null", '{"version":1,"sessions":null}'],
      ["array", "[1,2,3]"],
      ["scalar", '"nope"'],
    ])("valid JSON, invalid shape (%s): warns, returns default state", (_label, body) => {
      writeFileSync(join(testDir, "state.json"), body);
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(readState(testDir)).toEqual({ version: 1, sessions: {} });
      expect(warnSpy).toHaveBeenCalledWith(
        "state_parse_failed",
        expect.objectContaining({ path: expect.stringContaining("state.json"), reason: "invalid_shape" }),
        false,
      );
    });

    it("invalid shape: log fields carry no file contents", () => {
      writeFileSync(join(testDir, "state.json"), JSON.stringify({ foo: "super-secret-token-value" }));
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(readState(testDir)).toEqual({ version: 1, sessions: {} });
      const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(JSON.stringify(fields)).not.toContain("super-secret-token-value");
    });

    it("valid state: sessions preserved with no warn (no false positives)", () => {
      writeFileSync(
        join(testDir, "state.json"),
        JSON.stringify({ version: 1, sessions: { "s-1": { lastTs: 5 } } }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      expect(readState(testDir).sessions).toEqual({ "s-1": { lastTs: 5 } });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("valid state with optional blocks: preserved with no warn", () => {
      writeFileSync(
        join(testDir, "state.json"),
        JSON.stringify({
          version: 1,
          sessions: {},
          lastRecentCommitHashes: ["abc", 7, "def"],
          rate_limited_until: null,
        }),
      );
      const warnSpy = vi.spyOn(mcpLog, "warn");
      const state = readState(testDir);
      expect(state.lastRecentCommitHashes).toEqual(["abc", "def"]);
      expect(state.rate_limited_until).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
