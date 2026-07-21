import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ImpersonationProvider, useImpersonation } from "./ImpersonationContext";
import { IMPERSONATION_EXPIRED_EVENT } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { post: vi.fn().mockResolvedValue({}) },
  };
});

vi.mock("@/lib/queryClient", () => ({
  queryClient: { clear: vi.fn() },
}));

const STORAGE_KEY = "impersonation_token";

function makeToken(exp: number, impersonatorEmail = "admin@example.com"): string {
  const payload = { exp, impersonator_email: impersonatorEmail, sub: "user-1" };
  const encoded = btoa(JSON.stringify(payload));
  return `header.${encoded}.sig`;
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

function wrapper({ children }: { children: ReactNode }) {
  return <ImpersonationProvider>{children}</ImpersonationProvider>;
}

describe("ImpersonationContext — expired token on mount", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets isImpersonating=false (not just removes localStorage) when stored token is expired", () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(STORAGE_KEY, makeToken(expired));

    const { result } = renderHook(() => useImpersonation(), { wrapper });

    expect(result.current.isImpersonating).toBe(false);
    expect(result.current.impersonatorEmail).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("sets isImpersonating=true when stored token is still valid", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(STORAGE_KEY, makeToken(future, "admin@example.com"));

    const { result } = renderHook(() => useImpersonation(), { wrapper });

    expect(result.current.isImpersonating).toBe(true);
    expect(result.current.impersonatorEmail).toBe("admin@example.com");
  });

  it("sets isImpersonating=false when stored token is invalid", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-valid-jwt");

    const { result } = renderHook(() => useImpersonation(), { wrapper });

    expect(result.current.isImpersonating).toBe(false);
    expect(result.current.impersonatorEmail).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("ImpersonationContext — IMPERSONATION_EXPIRED_EVENT (same-tab expiry via api.ts)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("clears isImpersonating when api.ts dispatches the expired event mid-session", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(STORAGE_KEY, makeToken(future));

    const { result } = renderHook(() => useImpersonation(), { wrapper });
    expect(result.current.isImpersonating).toBe(true);

    // Simulate api.ts detecting expiry during a request and dispatching the event
    act(() => {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(IMPERSONATION_EXPIRED_EVENT));
    });

    expect(result.current.isImpersonating).toBe(false);
    expect(result.current.impersonatorEmail).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it("does not error when event fires without an active impersonation session", () => {
    const { result } = renderHook(() => useImpersonation(), { wrapper });
    expect(result.current.isImpersonating).toBe(false);

    expect(() => {
      act(() => {
        window.dispatchEvent(new CustomEvent(IMPERSONATION_EXPIRED_EVENT));
      });
    }).not.toThrow();

    expect(result.current.isImpersonating).toBe(false);
  });
});
