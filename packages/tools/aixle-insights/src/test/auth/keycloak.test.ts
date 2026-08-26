import { describe, expect, it, vi, afterEach } from "vitest";
import {
  defaultKeycloakClientId,
  defaultKeycloakIssuer,
  obtainKeycloakAccessTokenViaDeviceFlow,
  startDeviceAuthorization,
} from "../../auth/keycloak.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT;
  delete process.env.AIXLE_INSIGHTS_MCP_USE_LOCAL_KEYCLOAK_DEFAULT;
  delete process.env.DB90_KEYCLOAK_ISSUER;
  delete process.env.AIXLE_INSIGHTS_KEYCLOAK_ISSUER;
  delete process.env.KEYCLOAK_ISSUER;
  delete process.env.DB90_KEYCLOAK_CLIENT_ID;
  delete process.env.AIXLE_INSIGHTS_KEYCLOAK_CLIENT_ID;
});

const deviceBody = {
  device_code: "dc",
  user_code: "WXYZ-ABCD",
  verification_uri: "https://kc/device",
  expires_in: 120,
  interval: 1,
};

describe("startDeviceAuthorization", () => {
  it("parses a successful device authorization response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(deviceBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const start = await startDeviceAuthorization({
      issuer: "https://kc.example/realms/db90",
      clientId: "db90-web",
      fetchImpl,
    });
    expect(start.device_code).toBe("dc");
    expect(start.user_code).toBe("WXYZ-ABCD");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kc.example/realms/db90/protocol/openid-connect/auth/device",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
    const body = (fetchImpl.mock.calls[0][1] as { body: string }).body;
    expect(body).toContain("client_id=db90-web");
    expect(body).toContain("code_challenge_method=S256");
    expect(body).toContain("code_challenge=");
    expect(start.code_verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("obtainKeycloakAccessTokenViaDeviceFlow", () => {
  it("returns access_token after initial interval wait and successful token response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(deviceBody), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "kc-at", token_type: "Bearer" }), { status: 200 })
      );

    const onInstructions = vi.fn();
    const p = obtainKeycloakAccessTokenViaDeviceFlow({
      issuer: "https://kc.example/realms/db90",
      clientId: "db90-web",
      onInstructions,
      fetchImpl,
    });

    await new Promise((r) => setTimeout(r, 1200));
    await expect(p).resolves.toBe("kc-at");
    expect(onInstructions).toHaveBeenCalledWith("https://kc/device", "WXYZ-ABCD");
    const tokenBody = (fetchImpl.mock.calls[1][1] as { body: string }).body;
    expect(tokenBody).toContain("code_verifier=");
  }, 5000);

  it("throws on access_denied from token endpoint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(deviceBody), { status: 200 }))
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "access_denied" }), { status: 400 })
      );

    const p = obtainKeycloakAccessTokenViaDeviceFlow({
      issuer: "https://kc.example/realms/db90",
      clientId: "db90-web",
      fetchImpl,
    });
    const assertion = expect(p).rejects.toThrow(/access_denied/);
    await new Promise((r) => setTimeout(r, 1200));
    await assertion;
  }, 5000);

  it("continues through authorization_pending and slow_down before success", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(deviceBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "slow_down" }), { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "kc-after-slowdown", token_type: "Bearer" }), { status: 200 })
      );

    const p = obtainKeycloakAccessTokenViaDeviceFlow({
      issuer: "https://kc.example/realms/db90",
      clientId: "db90-web",
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(6000);
    await expect(p).resolves.toBe("kc-after-slowdown");
  });

  it("throws on expired_token from token endpoint", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(deviceBody), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }));

    const p = obtainKeycloakAccessTokenViaDeviceFlow({
      issuer: "https://kc.example/realms/db90",
      clientId: "db90-web",
      fetchImpl,
    });
    const assertion = expect(p).rejects.toThrow(/expired_token/);

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("includes the last transient polling error when timing out", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...deviceBody, expires_in: 2 }), { status: 200 }))
      .mockResolvedValue(new Response("not json", { status: 502 }));

    const p = obtainKeycloakAccessTokenViaDeviceFlow({
      issuer: "https://kc.example/realms/db90",
      clientId: "db90-web",
      fetchImpl,
    });
    const assertion = expect(p).rejects.toThrow(/last polling error: invalid JSON/);

    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });
});

describe("defaultKeycloakIssuer", () => {
  it("returns empty string when no env vars are set", () => {
    expect(defaultKeycloakIssuer()).toBe("");
  });

  it("returns localhost issuer when DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT is set and no ingest host given", () => {
    process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    expect(defaultKeycloakIssuer()).toBe("http://localhost:8080/realms/db90");
  });

  it("suppresses local default and emits warning when ingest host is a production (non-loopback) host", () => {
    process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = defaultKeycloakIssuer("https://api.aixle.io");
    expect(result).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("api.aixle.io"));
  });

  it("allows local default when ingest host is localhost", () => {
    process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    expect(defaultKeycloakIssuer("http://localhost:3000")).toBe("http://localhost:8080/realms/db90");
  });

  it("allows local default when ingest host is 127.0.0.1", () => {
    process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    expect(defaultKeycloakIssuer("http://127.0.0.1:3000")).toBe("http://localhost:8080/realms/db90");
  });

  it("suppresses local default triggered by NODE_ENV=development when ingest host is remote", () => {
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = defaultKeycloakIssuer("https://api.aixle.io");
      expect(result).toBe("");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("NODE_ENV=development"));
    } finally {
      if (savedNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = savedNodeEnv;
      }
    }
  });

  it("prefers explicit DB90_KEYCLOAK_ISSUER over local default even for a local ingest host", () => {
    process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    process.env.DB90_KEYCLOAK_ISSUER = "https://kc.example.com/realms/db90";
    expect(defaultKeycloakIssuer("http://localhost:3000")).toBe("https://kc.example.com/realms/db90");
  });

  it("enables local defaults via the current AIXLE_INSIGHTS_MCP_USE_LOCAL_KEYCLOAK_DEFAULT name", () => {
    expect(defaultKeycloakIssuer()).toBe("");
    process.env.AIXLE_INSIGHTS_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    expect(defaultKeycloakIssuer()).toBe("http://localhost:8080/realms/db90");
  });

  it("prefers AIXLE_INSIGHTS_KEYCLOAK_ISSUER over the deprecated DB90_KEYCLOAK_ISSUER", () => {
    process.env.AIXLE_INSIGHTS_KEYCLOAK_ISSUER = "https://kc.example/realms/current";
    process.env.DB90_KEYCLOAK_ISSUER = "https://kc.example/realms/deprecated";
    expect(defaultKeycloakIssuer()).toBe("https://kc.example/realms/current");
  });

  it("falls back to the deprecated DB90_KEYCLOAK_ISSUER when the current name is unset", () => {
    process.env.DB90_KEYCLOAK_ISSUER = "https://kc.example/realms/deprecated";
    expect(defaultKeycloakIssuer()).toBe("https://kc.example/realms/deprecated");
  });

  it("prefers the deprecated DB90_KEYCLOAK_ISSUER over the generic KEYCLOAK_ISSUER", () => {
    process.env.DB90_KEYCLOAK_ISSUER = "https://kc.example/realms/deprecated";
    process.env.KEYCLOAK_ISSUER = "https://kc.example/realms/generic";
    expect(defaultKeycloakIssuer()).toBe("https://kc.example/realms/deprecated");
  });

  it("warns on stderr when the deprecated DB90_KEYCLOAK_ISSUER supplies the value", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.DB90_KEYCLOAK_ISSUER = "https://kc.example/realms/deprecated";
    defaultKeycloakIssuer();
    expect(errorSpy).toHaveBeenCalledWith(
      "Warning: DB90_KEYCLOAK_ISSUER is deprecated; use AIXLE_INSIGHTS_KEYCLOAK_ISSUER instead."
    );
  });

  it("does not warn when only the current AIXLE_INSIGHTS_KEYCLOAK_ISSUER name is set", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.AIXLE_INSIGHTS_KEYCLOAK_ISSUER = "https://kc.example/realms/current";
    defaultKeycloakIssuer();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("defaultKeycloakClientId", () => {
  it("defaults to db90-web when no env var is set", () => {
    expect(defaultKeycloakClientId()).toBe("db90-web");
  });

  it("prefers AIXLE_INSIGHTS_KEYCLOAK_CLIENT_ID over the deprecated DB90_KEYCLOAK_CLIENT_ID", () => {
    process.env.AIXLE_INSIGHTS_KEYCLOAK_CLIENT_ID = "current-client";
    process.env.DB90_KEYCLOAK_CLIENT_ID = "deprecated-client";
    expect(defaultKeycloakClientId()).toBe("current-client");
  });

  it("falls back to the deprecated DB90_KEYCLOAK_CLIENT_ID when the current name is unset", () => {
    process.env.DB90_KEYCLOAK_CLIENT_ID = "deprecated-client";
    expect(defaultKeycloakClientId()).toBe("deprecated-client");
  });
});
