import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { OrgProvider, useOrg, ORG_STORAGE_KEY } from "./OrgContext";

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


const ORG_A = { id: "org-a", name: "Org A", slug: "org-a", isActive: true, userRole: "owner" };
const ORG_B = { id: "org-b", name: "Org B", slug: "org-b", isActive: true, userRole: "member" };
const ORG_C = { id: "org-c", name: "Org C", slug: "org-c", isActive: true, userRole: "member" };
const ORG_INACTIVE = {
  id: "org-inactive",
  name: "Inactive Org",
  slug: "inactive-org",
  isActive: false,
  userRole: "owner",
};

function makeOrgsResponse(orgs: typeof ORG_A[], meta?: Record<string, unknown>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: orgs, meta: meta ?? {} }),
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

  it("prefers localStorage over default_org_id (explicit user selection persists across refresh)", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_A.id);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B, ORG_C]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    // localStorage (ORG_A) wins over default_org_id (ORG_B)
    expect(result.current.currentOrg?.id).toBe(ORG_A.id);
  });

  it("falls back to default_org_id when localStorage is empty", async () => {
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

  it("falls back to first org when stored org ID is invalid and no default_org_id is set", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, "stale-org-id");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.currentOrg?.id).toBe(ORG_A.id);
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

  it("does not overwrite localStorage when user has an explicit org selection", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_A.id);
    const setItemSpy = vi.spyOn(localStorageMock, "setItem");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    // localStorage already has ORG_A which wins — no write to storage key
    expect(setItemSpy).not.toHaveBeenCalledWith(ORG_STORAGE_KEY, expect.anything());
  });

  it("writes localStorage when default_org_id is used as fallback (no stored org)", async () => {
    const setItemSpy = vi.spyOn(localStorageMock, "setItem");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(setItemSpy).toHaveBeenCalledWith(ORG_STORAGE_KEY, ORG_B.id);
  });

  it("selects preferOrgId over default_org_id and localStorage", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_A.id);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B, ORG_C]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never)
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B, ORG_C]) as never)
      .mockResolvedValueOnce(makeUserResponse(ORG_B.id) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    await result.current.refreshOrganizations(ORG_C.id);

    await waitFor(() => expect(result.current.currentOrg?.id).toBe(ORG_C.id));
  });

  it("filters out inactive orgs from the list", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [ORG_A, ORG_INACTIVE],
            meta: { has_inactive_organizations: true },
          }),
      } as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.organizations.map((o) => o.id)).toEqual(["org-a"]);
    expect(result.current.hasInactiveOrganizations).toBe(true);
  });

  it("sets hasInactiveOrganizations false when all orgs are active", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeOrgsResponse([ORG_A, ORG_B]) as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.hasInactiveOrganizations).toBe(false);
  });

  it("clears localStorage org selection when stored org is inactive (not in active list)", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_INACTIVE.id);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [ORG_A, ORG_INACTIVE],
            meta: { has_inactive_organizations: false },
          }),
      } as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    // Inactive org was filtered; localStorage id didn't match any active org
    // → fell back to first active org and rewrote storage
    expect(result.current.currentOrg?.id).toBe("org-a");
    expect(localStorage.getItem(ORG_STORAGE_KEY)).toBe("org-a");
  });

  it("removes localStorage org key when no active organizations remain", async () => {
    localStorage.setItem(ORG_STORAGE_KEY, ORG_INACTIVE.id);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            meta: { has_inactive_organizations: true },
          }),
      } as never)
      .mockResolvedValueOnce(makeUserResponse(null) as never);

    const { result } = renderHook(() => useOrg(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.currentOrg).toBeNull();
    expect(result.current.hasInactiveOrganizations).toBe(true);
    expect(localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
  });
});
