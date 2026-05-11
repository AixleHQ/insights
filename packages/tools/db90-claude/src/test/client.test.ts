import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postEvent, postEvents } from "../client.js";
import type { Db90Payload } from "../claude-reader.js";

const samplePayload: Db90Payload = {
  tool_name: "claude_code",
  event_type: "chat",
  model: "claude-opus-4-5",
  tokens_in: 100,
  tokens_out: 50,
  tokens_total: 150,
  cost_usd: null,
  occurred_at: "2024-01-01T00:00:00.000Z",
  metadata: { session_id: "abc123" },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("postEvent", () => {
  it("returns true on 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" })
    );
    const result = await postEvent(samplePayload, "http://localhost:3000", "tok");
    expect(result).toBe(true);
  });

  it("posts to the correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await postEvent(samplePayload, "http://localhost:3000", "tok");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/ingest/events",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("strips trailing slash from host", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await postEvent(samplePayload, "http://localhost:3000/", "tok");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/ingest/events",
      expect.anything()
    );
  });

  it("sets Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await postEvent(samplePayload, "http://localhost:3000", "my-token");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-token"
    );
  });

  it("returns false on 4xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Unauthorized"),
      })
    );
    const result = await postEvent(samplePayload, "http://localhost:3000", "bad-tok");
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await postEvent(samplePayload, "http://localhost:3000", "tok");
    expect(result).toBe(false);
  });
});

describe("postEvents", () => {
  it("returns zero counts for empty array", async () => {
    const result = await postEvents([], "http://localhost:3000", "tok");
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("counts sent and failed", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        call++;
        return Promise.resolve({ ok: call !== 2 });
      })
    );

    const events = [samplePayload, samplePayload, samplePayload];
    const result = await postEvents(events, "http://localhost:3000", "tok");
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
  });
});

describe("postEvents — on429 propagation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards on429 callback and counts 429 as failed", async () => {
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
    const result = await postEvents([samplePayload], "http://localhost:3000", "tok", { on429 });
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(on429).toHaveBeenCalledWith(60, false);
  });

  it("forwards on429 with quotaExceeded=true for quota_exceeded code", async () => {
    const on429 = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: (h: string) => (h === "Retry-After" ? "3600" : null) },
        json: () =>
          Promise.resolve({ error: "Quota Exceeded", code: "quota_exceeded", retry_after: 3600 }),
      })
    );
    const result = await postEvents([samplePayload], "http://localhost:3000", "tok", { on429 });
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(on429).toHaveBeenCalledWith(3600, true);
  });
});

describe("postEvent — security", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Bearer token is not echoed to console on success or failure", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleSpy2 = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await postEvent(samplePayload, "http://localhost:3000", "super-secret-token");
    for (const call of [...consoleSpy.mock.calls, ...consoleSpy2.mock.calls]) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("super-secret-token");
      }
    }
  });

  it("file:// host: fetch rejection returns false without uncaught error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await postEvent(samplePayload, "file:///etc/passwd", "tok");
    expect(result).toBe(false);
  });

  it("javascript:// host: fetch rejection returns false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await postEvent(samplePayload, "javascript://evil", "tok");
    expect(result).toBe(false);
  });

  it("host with path-injection suffix still appends the ingest endpoint", async () => {
    const capturedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        capturedUrls.push(url);
        return Promise.resolve({ ok: true, status: 200 });
      })
    );
    await postEvent(samplePayload, "https://legit.host/../../evil", "tok");
    expect(capturedUrls[0]).toMatch(/\/api\/v1\/ingest\/events/);
  });
});
