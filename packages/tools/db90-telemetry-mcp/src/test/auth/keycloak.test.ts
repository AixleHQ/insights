import { describe, expect, it, vi, afterEach } from "vitest";
import {
  defaultKeycloakIssuer,
  obtainKeycloakAccessTokenViaDeviceFlow,
  startDeviceAuthorization,
} from "../../auth/keycloak.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT;
  delete process.env.DB90_KEYCLOAK_ISSUER;
  delete process.env.KEYCLOAK_ISSUER;
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
  it("requires explicit issuer unless local defaults are enabled", () => {
    expect(defaultKeycloakIssuer()).toBe("");
    process.env.DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT = "true";
    expect(defaultKeycloakIssuer()).toBe("http://localhost:8080/realms/db90");
  });
});
