import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useLeaveOrganization } from "./useApi";

const mockApiDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useLeaveOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it("clears cached project-detail queries on success so a departed user re-fetches and gets 404 (AIX-611)", async () => {
    mockApiDelete.mockResolvedValue(undefined);
    const removeSpy = vi.spyOn(queryClient, "removeQueries");

    const { result } = renderHook(() => useLeaveOrganization(), { wrapper });

    result.current.mutate({ orgId: "org-1", memberId: "member-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiDelete).toHaveBeenCalledWith("/organizations/org-1/members/member-1");
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});
