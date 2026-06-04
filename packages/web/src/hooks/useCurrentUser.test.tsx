import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useCurrentUser } from "./useApi";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiGet = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    put: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  downloadBlob: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(message: string, status: number, data: unknown = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT fire when isLoading is true (auth still initializing)", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    // Query should stay idle/pending — fetchStatus should not be "fetching"
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("does NOT fire when isAuthenticated is false and isLoading is false", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("DOES fire when isLoading is false and isAuthenticated is true", async () => {
    const mockUser = { id: "user-1", email: "test@example.com", name: "Test User" };
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockApiGet.mockResolvedValue({ data: mockUser });

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiGet).toHaveBeenCalledWith("/users/me");
    expect(result.current.data).toEqual(mockUser);
  });

  it("does NOT fire when auth transitions from loading to unauthenticated", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("fires the query only after auth resolves to authenticated", async () => {
    const mockUser = { id: "user-2", email: "auth@example.com", name: "Auth User" };
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockApiGet.mockResolvedValue({ data: mockUser });

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith("/users/me");
  });
});
