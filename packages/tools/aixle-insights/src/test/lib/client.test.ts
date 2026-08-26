import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postEvent, type IngestPayload } from "../../lib/client.js";

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

describe("postEvent — 429 rate limiting", () => {
  it("returns false and calls on429 with rate_limit_exceeded", async () => {
    const on429 = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: (h: string) => (h === "Retry-After" ? "60" : null) },
        json: () => Promise.resolve({ error: "Rate Limited", code: "rate_limit_exceeded", retry_after: 60 }),
      })
    );
    expect(await postEvent(payload, "http://localhost:3000", "tok", { on429 })).toBe(false);
    expect(on429).toHaveBeenCalledWith(60, false);
  });

  it("returns false and calls on429 with quota_exceeded=true when code matches", async () => {
    const on429 = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: (h: string) => (h === "Retry-After" ? "3600" : null) },
        json: () =>
          Promise.resolve({
            error: "Quota Exceeded",
            code: "quota_exceeded",
            retry_after: 3600,
            quota_resets_at: "2026-06-01T00:00:00Z",
          }),
      })
    );
    expect(await postEvent(payload, "http://localhost:3000", "tok", { on429 })).toBe(false);
    expect(on429).toHaveBeenCalledWith(3600, true);
  });

  it("falls back to retryAfter=60 when Retry-After header is missing or malformed", async () => {
    const on429 = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      })
    );
    await postEvent(payload, "http://localhost:3000", "tok", { on429 });
    expect(on429).toHaveBeenCalledWith(60, false);
  });

  it("gracefully handles 429 with unparseable body — on429 still called", async () => {
    const on429 = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: (h: string) => (h === "Retry-After" ? "60" : null) },
        json: () => Promise.reject(new Error("invalid json")),
      })
    );
    expect(await postEvent(payload, "http://localhost:3000", "tok", { on429 })).toBe(false);
    expect(on429).toHaveBeenCalledWith(60, false);
  });

  it("does not call on429 for non-429 errors", async () => {
    const on429 = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("denied"),
      })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await postEvent(payload, "http://localhost:3000", "tok", { on429 });
    expect(on429).not.toHaveBeenCalled();
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

  it("file:// host is rejected by the transport-security gate before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postEvent(payload, "file:///etc/passwd", "tok")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("postEvent — transport security", () => {
  it("rejects a remote http host and never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await postEvent(payload, "http://attacker.example", "tok")).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("attacker.example"));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("plaintext HTTP"));
  });

  it("does not mark a rejected send as retry-eligible", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onNetworkError = vi.fn();
    const onHttpError = vi.fn();

    await postEvent(payload, "http://attacker.example", "tok", { onNetworkError, onHttpError });

    expect(onNetworkError).not.toHaveBeenCalled();
    expect(onHttpError).not.toHaveBeenCalled();
  });

  it("allows a remote http host when allowInsecureHttp is true, with a warning", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await postEvent(payload, "http://trusted-staging.example", "tok", { allowInsecureHttp: true })
    ).toBe(true);

    expect(fetchMock).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Warning:"));
  });

  it("still allows loopback http with no allowInsecureHttp and no warning", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await postEvent(payload, "http://localhost:3000", "tok")).toBe(true);

    expect(errSpy).not.toHaveBeenCalled();
  });

  it("never echoes the bearer token when blocking an insecure send", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await postEvent(payload, "http://attacker.example", "super-secret-token-xyz");

    for (const call of errSpy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("super-secret-token-xyz");
      }
    }
  });
});
