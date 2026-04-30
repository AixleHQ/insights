import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.js";

/**
 * auth.ts depends on keychain.ts (for saveCredentials) and log.js (via
 * keychain/config). We mock APP_DIR and keytar before importing auth.ts so
 * tests run in isolation without touching the real home directory.
 */

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "db90-mcp-auth-test-"));
  vi.resetModules();
  vi.doMock("../log.js", () => ({ APP_DIR: join(tmp, ".db90-mcp"), recordError: vi.fn() }));
  // Stub keytar as unavailable so credentials fall back to the temp file path.
  vi.doMock("keytar", () => {
    throw new Error("keytar unavailable");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(tmp, { recursive: true, force: true });
});

/** Build a typed Config pointing at controllable endpoints for tests. */
function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: "https://db90.example.com",
    keycloakIssuer: "https://auth.example.com/realms/test",
    defaultToolName: "claude_code",
    ...overrides,
  };
}

/** Helpers to build mock Response-like objects. */
function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: "server error" }),
  } as unknown as Response;
}

function jsonThrowsResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.reject(new Error("invalid json")),
  } as unknown as Response;
}

/** Well-formed device-flow start response (interval=0 avoids actual sleeping). */
const deviceFlowStart = {
  device_code: "dev_code_abc",
  user_code: "ABCD-1234",
  verification_uri: "https://auth.example.com/device",
  expires_in: 600,
  interval: 0, // 0 seconds → sleep(0) for tests
};

/** Well-formed discovery response. */
const discoveryResponse = {
  device_authorization_endpoint: "https://auth.example.com/device",
  token_endpoint: "https://auth.example.com/token",
};

/** Well-formed exchange response. */
const exchangeResponse = { ingest_token: "tok_ingest", host: "https://db90.example.com" };

describe("authenticate — OIDC discovery errors", () => {
  it("rejects when OIDC discovery returns HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(errResponse(503)));
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(/OIDC discovery failed/);
  });

  it("rejects when OIDC discovery returns malformed JSON (json() throws)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonThrowsResponse()));
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow();
  });

  it("rejects when discovery JSON is missing device_authorization_endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(okJson({ token_endpoint: "https://auth.example.com/token" }))
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /OIDC discovery missing/
    );
  });

  it("rejects when discovery JSON is missing token_endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        okJson({ device_authorization_endpoint: "https://auth.example.com/device" })
      )
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /OIDC discovery missing/
    );
  });
});

describe("authenticate — device flow start errors", () => {
  it("rejects when device-flow endpoint returns HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse)) // discovery
        .mockResolvedValueOnce(errResponse(400))          // device auth fails
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /Device authorization request failed/
    );
  });
});

describe("authenticate — device flow poll errors", () => {
  it("rejects with 'Login was denied' on access_denied error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))                        // discovery
        .mockResolvedValueOnce(okJson(deviceFlowStart))                          // start
        .mockResolvedValueOnce(okJson({ error: "access_denied" }))               // poll → denied
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow("Login was denied");
  });

  it("rejects with 'Login flow expired' on expired_token error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))
        .mockResolvedValueOnce(okJson(deviceFlowStart))
        .mockResolvedValueOnce(okJson({ error: "expired_token" }))
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /Login flow expired/
    );
  });

  it("rejects with generic error message on unexpected poll error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))
        .mockResolvedValueOnce(okJson(deviceFlowStart))
        .mockResolvedValueOnce(okJson({ error: "some_unknown_error", error_description: "details" }))
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /Token endpoint error/
    );
  });
});

describe("authenticate — token exchange errors", () => {
  const tokenResponse = { access_token: "oidc_tok_abc" };

  it("rejects when exchange returns HTTP 500 and does not save credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))
        .mockResolvedValueOnce(okJson(deviceFlowStart))
        .mockResolvedValueOnce(okJson(tokenResponse))   // poll succeeds
        .mockResolvedValueOnce(errResponse(500))        // exchange fails
    );
    const { authenticate } = await import("../auth.js");
    const { loadCredentials } = await import("../keychain.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(/Exchange failed/);
    const creds = await loadCredentials();
    expect(creds).toBeNull();
  });

  it("rejects when exchange response is missing ingest_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))
        .mockResolvedValueOnce(okJson(deviceFlowStart))
        .mockResolvedValueOnce(okJson(tokenResponse))
        .mockResolvedValueOnce(okJson({ host: "https://db90.example.com" })) // no ingest_token
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /Exchange response missing/
    );
  });

  it("rejects when exchange response is missing host field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))
        .mockResolvedValueOnce(okJson(deviceFlowStart))
        .mockResolvedValueOnce(okJson(tokenResponse))
        .mockResolvedValueOnce(okJson({ ingest_token: "tok" })) // no host
    );
    const { authenticate } = await import("../auth.js");
    await expect(authenticate({ config: testConfig() })).rejects.toThrow(
      /Exchange response missing/
    );
  });
});

describe("authenticate — prototype pollution in token exchange response", () => {
  it("__proto__ injection in exchange response does not pollute Object.prototype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(okJson(discoveryResponse))
        .mockResolvedValueOnce(okJson(deviceFlowStart))
        .mockResolvedValueOnce(okJson({ access_token: "oidc_tok" }))
        .mockResolvedValueOnce(
          okJson({
            "__proto__": { "isAdmin": true },
            ingest_token: "tok_ingest",
            host: "https://db90.example.com",
          })
        )
    );
    const { authenticate } = await import("../auth.js");
    await authenticate({ config: testConfig() });
    expect((Object.prototype as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>)["isAdmin"];
  });

  it("__proto__ injection in OIDC discovery response does not pollute Object.prototype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        okJson({
          "__proto__": { "polluted": true },
          device_authorization_endpoint: "https://auth.example.com/device",
          token_endpoint: "https://auth.example.com/token",
        })
      )
    );
    const { authenticate } = await import("../auth.js");
    // Might succeed or fail depending on subsequent mocks — we don't care; just check pollution.
    await authenticate({ config: testConfig() }).catch(() => {});
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>)["polluted"];
  });
});

describe("getAuthStatus — security invariants", () => {
  it("returns { authenticated: false, host: null } when no credentials are stored", async () => {
    // No credentials file exists (fresh tmp dir, keytar unavailable).
    const { getAuthStatus } = await import("../auth.js");
    const status = await getAuthStatus();
    expect(status.authenticated).toBe(false);
    expect(status.host).toBeNull();
  });

  it("returns authenticated=true when credentials are stored", async () => {
    const { getAuthStatus } = await import("../auth.js");
    const { saveCredentials } = await import("../keychain.js");
    await saveCredentials("tok_test", "https://db90.example.com");
    const status = await getAuthStatus();
    expect(status.authenticated).toBe(true);
    expect(status.host).toBe("https://db90.example.com");
  });
});
