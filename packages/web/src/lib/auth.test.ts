import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorResponse } from "oidc-client-ts";

// Mock the UserManager so auth.ts's lazy getUserManager() returns a controllable stub
// (event registration is a no-op) — ErrorResponse and the rest of oidc-client-ts stay real
// so isDeadSessionError is exercised against genuine ErrorResponse instances.
const mockManager = {
  getUser: vi.fn(),
  signinSilent: vi.fn(),
  signoutRedirect: vi.fn().mockResolvedValue(undefined),
  events: {
    addAccessTokenExpiring: vi.fn(),
    addAccessTokenExpired: vi.fn(),
    addSilentRenewError: vi.fn(),
    addUserLoaded: vi.fn(),
    addUserUnloaded: vi.fn(),
    addUserSignedOut: vi.fn(),
  },
};

vi.mock("oidc-client-ts", async () => {
  const actual = await vi.importActual<typeof import("oidc-client-ts")>("oidc-client-ts");
  // Regular function (not an arrow) so it can be invoked with `new` — auth.ts does
  // `new UserManager(settings)`; returning an object from a constructor yields that object.
  return {
    ...actual,
    UserManager: vi.fn(function () {
      return mockManager;
    }),
  };
});

vi.mock("./rollbar", () => ({ reportAuthError: vi.fn() }));

import { isDeadSessionError, getAccessToken, logout } from "./auth";
import { ORG_STORAGE_KEY } from "../contexts/OrgContext";

describe("isDeadSessionError", () => {
  it("is true for a Keycloak invalid_grant ErrorResponse (dead refresh token / code)", () => {
    expect(
      isDeadSessionError(
        new ErrorResponse({ error: "invalid_grant", error_description: "Token is not active" })
      )
    ).toBe(true);
    expect(
      isDeadSessionError(
        new ErrorResponse({ error: "invalid_grant", error_description: "Code not valid" })
      )
    ).toBe(true);
  });

  it("is false for other OIDC error codes", () => {
    expect(isDeadSessionError(new ErrorResponse({ error: "invalid_scope" }))).toBe(false);
    expect(isDeadSessionError(new ErrorResponse({ error: "server_error" }))).toBe(false);
  });

  it("is false for transient/network errors (not an ErrorResponse)", () => {
    expect(isDeadSessionError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isDeadSessionError(new Error("boom"))).toBe(false);
  });

  it("matches via the name marker when instanceof fails (cross-bundle)", () => {
    expect(isDeadSessionError({ name: "ErrorResponse", error: "invalid_grant" })).toBe(true);
    expect(isDeadSessionError({ name: "ErrorResponse", error: "invalid_scope" })).toBe(false);
  });

  it("is false for null / undefined / non-objects", () => {
    expect(isDeadSessionError(null)).toBe(false);
    expect(isDeadSessionError(undefined)).toBe(false);
    expect(isDeadSessionError("invalid_grant")).toBe(false);
  });
});

describe("getAccessToken", () => {
  beforeEach(() => {
    mockManager.getUser.mockReset();
    mockManager.signinSilent.mockReset();
  });

  it("returns null (not the stale token) when silent renew fails with a dead session", async () => {
    mockManager.getUser.mockResolvedValue({ expired: true, access_token: "stale-token" });
    mockManager.signinSilent.mockRejectedValue(
      new ErrorResponse({ error: "invalid_grant", error_description: "Token is not active" })
    );

    await expect(getAccessToken()).resolves.toBeNull();
  });

  it("returns the existing token when silent renew fails transiently (network)", async () => {
    mockManager.getUser.mockResolvedValue({ expired: true, access_token: "stale-token" });
    mockManager.signinSilent.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(getAccessToken()).resolves.toBe("stale-token");
  });

  it("returns the current token without renewing when it is still valid", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    mockManager.getUser.mockResolvedValue({
      expired: false,
      expires_at: future,
      access_token: "good-token",
    });

    await expect(getAccessToken()).resolves.toBe("good-token");
    expect(mockManager.signinSilent).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  const memoryStore: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((key: string) => memoryStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      memoryStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete memoryStore[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(memoryStore)) delete memoryStore[key];
    }),
  };

  beforeEach(() => {
    for (const key of Object.keys(memoryStore)) delete memoryStore[key];
    mockManager.signoutRedirect.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears stored org from localStorage before redirecting (AIX-318)", async () => {
    memoryStore[ORG_STORAGE_KEY] = "org-123";
    await logout();
    expect(memoryStore[ORG_STORAGE_KEY]).toBeUndefined();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(ORG_STORAGE_KEY);
    expect(mockManager.signoutRedirect).toHaveBeenCalledOnce();
  });

  it("still calls signoutRedirect even when no org was stored", async () => {
    await logout();
    expect(mockManager.signoutRedirect).toHaveBeenCalledOnce();
  });

  it("clears the Administrate session before Keycloak signoutRedirect", async () => {
    await logout();

    expect(fetch).toHaveBeenCalledWith(
      "/admin/logout",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      })
    );
    expect(mockManager.signoutRedirect).toHaveBeenCalled();
  });

  it("still signs out of Keycloak if admin session clear fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await logout();

    expect(mockManager.signoutRedirect).toHaveBeenCalled();
  });

  it("still signs out of Keycloak if admin session clear hangs past timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      )
    );

    const logoutPromise = logout();
    await vi.advanceTimersByTimeAsync(3000);
    await logoutPromise;

    expect(mockManager.signoutRedirect).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
