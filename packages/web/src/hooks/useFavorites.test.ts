import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useFavorites } from "./useFavorites";

const mockMutate = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useFavoriteProjects: vi.fn(),
  useToggleFavorite: vi.fn(() => ({ mutate: mockMutate })),
}));

import { useFavoriteProjects } from "@/hooks/useApi";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFavorites", () => {
  it("returns an empty list when there are no favorites", () => {
    vi.mocked(useFavoriteProjects).mockReturnValue({ data: [] } as ReturnType<typeof useFavoriteProjects>);

    const { result } = renderHook(() => useFavorites(), { wrapper });
    expect(result.current.favorites).toEqual([]);
  });

  it("returns favorites from the API query", () => {
    const projects = [{ id: "p1", name: "Project One" }];
    vi.mocked(useFavoriteProjects).mockReturnValue({ data: projects } as ReturnType<typeof useFavoriteProjects>);

    const { result } = renderHook(() => useFavorites(), { wrapper });
    expect(result.current.favorites).toEqual(projects);
  });

  it("isFavorite returns true for a favorited project", () => {
    vi.mocked(useFavoriteProjects).mockReturnValue({ data: [{ id: "p2", name: "Project Two" }] } as ReturnType<typeof useFavoriteProjects>);

    const { result } = renderHook(() => useFavorites(), { wrapper });
    expect(result.current.isFavorite("p2")).toBe(true);
    expect(result.current.isFavorite("p99")).toBe(false);
  });

  it("toggleFavorite calls mutate with favorited=false when project is not yet favorited", () => {
    vi.mocked(useFavoriteProjects).mockReturnValue({ data: [] } as ReturnType<typeof useFavoriteProjects>);

    const { result } = renderHook(() => useFavorites(), { wrapper });
    act(() => {
      result.current.toggleFavorite({ id: "p3", name: "Project Three" });
    });

    expect(mockMutate).toHaveBeenCalledWith({ id: "p3", favorited: false });
  });

  it("toggleFavorite calls mutate with favorited=true when project is already favorited", () => {
    vi.mocked(useFavoriteProjects).mockReturnValue({ data: [{ id: "p4", name: "Project Four" }] } as ReturnType<typeof useFavoriteProjects>);

    const { result } = renderHook(() => useFavorites(), { wrapper });
    act(() => {
      result.current.toggleFavorite({ id: "p4", name: "Project Four" });
    });

    expect(mockMutate).toHaveBeenCalledWith({ id: "p4", favorited: true });
  });

  it("returns empty list when query data is undefined", () => {
    vi.mocked(useFavoriteProjects).mockReturnValue({ data: undefined } as ReturnType<typeof useFavoriteProjects>);

    const { result } = renderHook(() => useFavorites(), { wrapper });
    expect(result.current.favorites).toEqual([]);
  });
});
