import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeProvider, useTheme } from "./ThemeContext";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    put: vi.fn().mockResolvedValue({}),
  },
}));

// Mock queryClient
vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

// Mock queryKeys and useCurrentUser
vi.mock("@/hooks/useApi", () => ({
  queryKeys: {
    user: { current: ["user", "current"] },
  },
  useCurrentUser: () => ({ data: undefined }),
}));

// localStorage mock
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

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// matchMedia mock
const createMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    window.matchMedia = createMatchMedia(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to system theme when no localStorage value", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("system");
  });

  it("reads initial theme from localStorage", () => {
    localStorage.setItem("db90_theme", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });

  it("applies .dark class when theme is dark", () => {
    localStorage.setItem("db90_theme", "dark");
    renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes .dark class when theme is light", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("db90_theme", "light");
    renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme updates theme and applies class immediately", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme persists to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("light");
    });

    expect(localStorage.getItem("db90_theme")).toBe("light");
  });

  it("setTheme calls api.put with correct key and value", async () => {
    const { api } = await import("@/lib/api");
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("dark");
    });

    expect(api.put).toHaveBeenCalledWith("/users/me/settings/theme", { value: "dark" });
  });

  it("resolves system theme using matchMedia when theme is system", () => {
    window.matchMedia = createMatchMedia(true); // system prefers dark
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("system");
    });

    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("throws when used outside ThemeProvider", () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow("useTheme must be used within a ThemeProvider");
  });

  it("falls back to system when localStorage contains an invalid value", () => {
    localStorage.setItem("db90_theme", "purple");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("system");
  });
});
