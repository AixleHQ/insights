import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDownloadPersonalExport } from "./useApi";

const mockDownloadBlob = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
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

describe("useDownloadPersonalExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownloadBlob.mockResolvedValue(undefined);
  });

  it("requests a bare endpoint so downloadBlob's /api/v1 prefix is not doubled", async () => {
    const { result } = renderHook(() => useDownloadPersonalExport());

    await act(async () => {
      await result.current.download({ reportType: "my_events", format: "csv" });
    });

    const endpoint = mockDownloadBlob.mock.calls[0][0] as string;
    expect(endpoint).toMatch(/^\/users\/me\/exports\?/);
    expect(endpoint).not.toContain("/api/v1");
    expect(endpoint).toContain("report_type=my_events");
    expect(endpoint).toContain("format=csv");
  });

  it("passes optional from/to dates through as query params", async () => {
    const { result } = renderHook(() => useDownloadPersonalExport());

    await act(async () => {
      await result.current.download({
        reportType: "my_cost_by_tool",
        format: "json",
        from: "2026-01-01",
        to: "2026-01-31",
      });
    });

    const endpoint = mockDownloadBlob.mock.calls[0][0] as string;
    expect(endpoint).toContain("from=2026-01-01");
    expect(endpoint).toContain("to=2026-01-31");
  });

  it("surfaces the error message when downloadBlob rejects", async () => {
    mockDownloadBlob.mockRejectedValueOnce(new Error("Request failed with status 404"));

    const { result } = renderHook(() => useDownloadPersonalExport());

    await act(async () => {
      await result.current.download({ reportType: "my_events", format: "csv" });
    });

    await waitFor(() => expect(result.current.error).toBe("Request failed with status 404"));
    expect(result.current.isDownloading).toBe(false);
  });
});
