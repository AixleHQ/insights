import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFavorites } from "./useFavorites";

const STORAGE_KEY = "db90_favorite_projects";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("useFavorites", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  it("starts with an empty list when localStorage is empty", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it("toggleFavorite adds a project", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggleFavorite({ id: "p1", name: "Project One" });
    });
    expect(result.current.favorites).toEqual([{ id: "p1", name: "Project One" }]);
  });

  it("toggleFavorite removes an already-favorited project", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggleFavorite({ id: "p1", name: "Project One" });
    });
    act(() => {
      result.current.toggleFavorite({ id: "p1", name: "Project One" });
    });
    expect(result.current.favorites).toEqual([]);
  });

  it("isFavorite returns true for a favorited project", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggleFavorite({ id: "p2", name: "Project Two" });
    });
    expect(result.current.isFavorite("p2")).toBe(true);
    expect(result.current.isFavorite("p99")).toBe(false);
  });

  it("persists favorites to localStorage on toggle", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggleFavorite({ id: "p3", name: "Project Three" });
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toEqual([{ id: "p3", name: "Project Three" }]);
  });

  it("reads existing favorites from localStorage on mount", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "p4", name: "Project Four" }]),
    );
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([{ id: "p4", name: "Project Four" }]);
  });

  it("handles corrupt localStorage value gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{");
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it("syncs state across hook instances via custom event", () => {
    const { result: a } = renderHook(() => useFavorites());
    const { result: b } = renderHook(() => useFavorites());

    act(() => {
      a.current.toggleFavorite({ id: "p5", name: "Project Five" });
    });

    expect(b.current.favorites).toEqual([{ id: "p5", name: "Project Five" }]);
  });
});
