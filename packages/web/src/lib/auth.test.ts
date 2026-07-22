import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("logout", () => {
  beforeEach(() => {
    mockManager.signoutRedirect.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
  });

  it("clears stored org from localStorage before redirecting (AIX-318)", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, "org-123");
    await logout();
    expect(localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
    expect(mockManager.signoutRedirect).toHaveBeenCalledOnce();
  });

  it("still calls signoutRedirect even when no org was stored", async () => {
    await logout();
    expect(mockManager.signoutRedirect).toHaveBeenCalledOnce();
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
