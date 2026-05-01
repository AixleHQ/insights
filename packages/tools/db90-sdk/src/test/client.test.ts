import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postEvent, type IngestPayload } from "../client.js";

const payload: IngestPayload = {
  tool_name: "test",
  occurred_at: "2024-01-01T00:00:00.000Z",
  tokens_in: 100,
  tokens_out: 50,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postEvent — happy path", () => {
  it("returns true on 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(""),
      })
    );
    expect(await postEvent(payload, "http://localhost:3000", "tok")).toBe(true);
  });

  it("sends Authorization: Bearer header and JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
    await postEvent(payload, "http://localhost:3000", "super-secret");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/v1/ingest/events");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer super-secret");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it("strips trailing slash from host before appending endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
    await postEvent(payload, "http://localhost:3000/", "tok");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/v1/ingest/events");
  });
});

describe("postEvent — failure paths", () => {
  it("returns false on 4xx response and logs error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("bad token"),
      })
    );
    expect(await postEvent(payload, "http://localhost:3000", "tok")).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP 401 Unauthorized"));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("bad token"));
  });

  it("returns false on network-level failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("ECONNREFUSED")));
    expect(await postEvent(payload, "http://localhost:3000", "tok")).toBe(false);
  });

  it("never throws when response.text() rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.reject(new Error("body read failed")),
      })
    );
    await expect(postEvent(payload, "http://localhost:3000", "tok")).resolves.toBe(false);
  });
});

describe("postEvent — error callbacks", () => {
  it("custom onHttpError is invoked instead of console.error", async () => {
    const onHttpError = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable",
        text: () => Promise.resolve("invalid"),
      })
    );
    await postEvent(payload, "http://localhost:3000", "tok", { onHttpError });
    expect(onHttpError).toHaveBeenCalledWith(422, "Unprocessable", "invalid");
  });

  it("custom onNetworkError is invoked instead of console.error", async () => {
    const onNetworkError = vi.fn();
    const err = new TypeError("fetch failed");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
    await postEvent(payload, "http://localhost:3000", "tok", { onNetworkError });
    expect(onNetworkError).toHaveBeenCalledWith(err);
  });
});

describe("postEvent — security", () => {
  it("Bearer token is not echoed to console on failure", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("denied"),
      })
    );
    await postEvent(payload, "http://localhost:3000", "super-secret-token-xyz");
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("super-secret-token-xyz");
      }
    }
  });

  it("file:// host gracefully returns false (fetch rejects)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await postEvent(payload, "file:///etc/passwd", "tok")).toBe(false);
  });
});
