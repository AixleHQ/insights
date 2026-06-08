import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { OrgProvider, useOrg } from "./OrgContext";

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("./ImpersonationContext", () => ({
  useImpersonation: () => ({ isImpersonating: false }),
}));

vi.mock("../lib/api", () => ({
  getAuthToken: vi.fn().mockResolvedValue("test-token"),
  setCurrentOrganizationId: vi.fn(),
}));

const ORG_STORAGE_KEY = "db90_current_org_id";

const ORG_A = { id: "org-a", name: "Org A", slug: "org-a", isActive: true, userRole: "owner" };
const ORG_B = { id: "org-b", name: "Org B", slug: "org-b", isActive: true, userRole: "member" };
const ORG_C = { id: "org-c", name: "Org C", slug: "org-c", isActive: true, userRole: "member" };

function makeOrgsResponse(orgs: typeof ORG_A[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: orgs }),
  } as Response);
}

function makeUserResponse(defaultOrgId: string | null) {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        data: { settings: defaultOrgId ? { default_org_id: defaultOrgId } : {} },
      }),
  } as Response);
}

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

function wrapper({ children }: { children: ReactNode }) {
  return <OrgProvider>{children}</OrgProvider>;
}

describe("OrgProvider — org selection priority", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects default_org_id when set, ignoring localStorage", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_A.id);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B, ORG_C]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.currentOrg?.id).toBe(ORG_B.id);
  });

  it("falls back to localStorage when no default_org_id is set", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_C.id);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B, ORG_C]) as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.currentOrg?.id).toBe(ORG_C.id);
  });

  it("falls back to first org when neither default_org_id nor localStorage is set", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B, ORG_C]) as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.currentOrg?.id).toBe(ORG_A.id);
  });

  it("warns and falls back to first org when stored org ID no longer exists", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, "stale-org-id");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.currentOrg?.id).toBe(ORG_A.id);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("stale-org-id"));
  });

  it("syncs localStorage only when the selected org differs from the stored value", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_A.id);
    const setItemSpy = vi.spyOn(localStorageMock, "setItem");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    // ORG_A was already stored — no write needed
    expect(setItemSpy).not.toHaveBeenCalledWith(ORG_STORAGE_KEY, ORG_A.id);
  });

  it("writes localStorage when default_org_id differs from stored value", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_A.id);
    const setItemSpy = vi.spyOn(localStorageMock, "setItem");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(setItemSpy).toHaveBeenCalledWith(ORG_STORAGE_KEY, ORG_B.id);
  });
});
