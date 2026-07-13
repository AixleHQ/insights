import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOrgNavGuard } from "./useOrgNavGuard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockCurrentOrgId: string | undefined = "org-1";

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({ currentOrg: mockCurrentOrgId ? { id: mockCurrentOrgId } : null }),
}));

describe("useOrgNavGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentOrgId = "org-1";
  });

  it("does not navigate on initial render", () => {
    renderHook(() => useOrgNavGuard("/projects"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to redirectTo when org id changes", () => {
    const { rerender } = renderHook(() => useOrgNavGuard("/projects"));

    mockCurrentOrgId = "org-2";
    rerender();

    expect(mockNavigate).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/projects");
  });

  it("respects the redirectTo argument", () => {
    const { rerender } = renderHook(() => useOrgNavGuard("/events"));

    mockCurrentOrgId = "org-2";
    rerender();

    expect(mockNavigate).toHaveBeenCalledWith("/events");
  });

  it("does not navigate when org id stays the same across re-renders", () => {
    const { rerender } = renderHook(() => useOrgNavGuard("/projects"));
    rerender();
    rerender();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate when org first becomes defined (loading → ready)", () => {
    mockCurrentOrgId = undefined;
    const { rerender } = renderHook(() => useOrgNavGuard("/projects"));

    mockCurrentOrgId = "org-1";
    rerender();

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
