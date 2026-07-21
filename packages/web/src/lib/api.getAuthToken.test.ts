import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("./auth", () => ({
  getAccessToken: vi.fn().mockResolvedValue("admin-oidc-token"),
  silentRenew: vi.fn(),
}));

import { getAuthToken, IMPERSONATION_EXPIRED_EVENT } from "./api";
import { getAccessToken } from "./auth";

const STORAGE_KEY = "impersonation_token";

function makeToken(exp: number): string {
  const payload = { exp, impersonator_email: "admin@example.com", sub: "user-1" };
  return `header.${btoa(JSON.stringify(payload))}.sig`;
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("getAuthToken — impersonation token handling", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid impersonation token", async () => {
    const token = makeToken(Math.floor(Date.now() / 1000) + 3600);
    localStorage.setItem(STORAGE_KEY, token);

    await expect(getAuthToken()).resolves.toBe(token);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("removes expired token, dispatches IMPERSONATION_EXPIRED_EVENT, and falls back to OIDC", async () => {
    localStorage.setItem(STORAGE_KEY, makeToken(Math.floor(Date.now() / 1000) - 60));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await expect(getAuthToken()).resolves.toBe("admin-oidc-token");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: IMPERSONATION_EXPIRED_EVENT }),
    );
    expect(getAccessToken).toHaveBeenCalled();
  });

  it("removes malformed token (≠3 parts), dispatches event, and falls back to OIDC", async () => {
    localStorage.setItem(STORAGE_KEY, "not.a.jwt.with.too.many.parts");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await expect(getAuthToken()).resolves.toBe("admin-oidc-token");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: IMPERSONATION_EXPIRED_EVENT }),
    );
  });

  it("removes undecodable token, dispatches event, and falls back to OIDC", async () => {
    localStorage.setItem(STORAGE_KEY, "header.!!!not-base64!!!.sig");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await expect(getAuthToken()).resolves.toBe("admin-oidc-token");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: IMPERSONATION_EXPIRED_EVENT }),
    );
  });
});
