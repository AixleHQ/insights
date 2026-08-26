import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProjectAccess } from "./useProjectAccess";

const mockUseProject = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
}));

const mockProject = { id: "proj-1", name: "My Project" };

describe("useProjectAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the project when the query succeeded after mount", () => {
    mockUseProject.mockReturnValue({
      data: mockProject,
      isLoading: false,
      isFetching: false,
      isFetchedAfterMount: true,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() => useProjectAccess("proj-1"));

    expect(result.current.project).toEqual(mockProject);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAccessDenied).toBe(false);
  });

  it("stays loading while revalidating cached data on mount", () => {
    mockUseProject.mockReturnValue({
      data: mockProject,
      isLoading: false,
      isFetching: true,
      isFetchedAfterMount: false,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() => useProjectAccess("proj-1"));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAccessDenied).toBe(false);
  });

  it("denies access on 403/404 even when stale project data remains", () => {
    mockUseProject.mockReturnValue({
      data: mockProject,
      isLoading: false,
      isFetching: false,
      isFetchedAfterMount: true,
      isError: true,
      error: { message: "Not found", status: 404 },
    });

    const { result } = renderHook(() => useProjectAccess("proj-1"));

    expect(result.current.isAccessDenied).toBe(true);
    expect(result.current.project).toEqual(mockProject);
  });
});
