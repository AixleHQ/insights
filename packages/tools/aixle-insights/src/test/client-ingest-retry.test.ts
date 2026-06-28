import { describe, it, expect, vi, afterEach } from "vitest";
import { postEvent } from "../client.js";

describe("postEvent transient retry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not retry on 429 and still invokes on429 once", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: "quota_exceeded" }), {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "60", "Content-Type": "application/json" },
      })
    );
    const on429 = vi.fn();
    const ok = await postEvent(
      { occurred_at: "2026-05-15T12:00:00.000Z", tool_name: "claude_code" },
      "http://localhost:3000",
      "tok",
      { on429, logTransientRetries: false, waitMs: async () => {} }
    );
    expect(ok).toBe(false);
    expect(on429).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry permanent 4xx HTTP failures", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(
      new Response("unauthorized", { status: 401, statusText: "Unauthorized" })
    );
    const waits: number[] = [];
    const ok = await postEvent(
      { occurred_at: "2026-05-15T12:00:00.000Z", tool_name: "claude_code" },
      "http://localhost:3000",
      "tok",
      {
        logTransientRetries: false,
        onHttpError: () => undefined,
        waitMs: async (ms) => {
          waits.push(ms);
        },
      }
    );
    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("retries transient HTTP failures then succeeds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(new Response("bad", { status: 502, statusText: "Bad Gateway" }))
      .mockResolvedValueOnce(new Response("bad", { status: 503, statusText: "Service Unavailable" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    const waits: number[] = [];
    const ok = await postEvent(
      { occurred_at: "2026-05-15T12:00:00.000Z" },
      "http://localhost:3000",
      "tok",
      {
        logTransientRetries: false,
        onHttpError: () => undefined,
        waitMs: async (ms) => {
          waits.push(ms);
        },
      }
    );
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 4000]);
  });

  it("returns false after exhausting transient retries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(new Response("err", { status: 500, statusText: "Internal Server Error" }));
    const waits: number[] = [];
    const ok = await postEvent(
      { occurred_at: "2026-05-15T12:00:00.000Z" },
      "http://localhost:3000",
      "tok",
      {
        logTransientRetries: false,
        onHttpError: () => undefined,
        waitMs: async (ms) => {
          waits.push(ms);
        },
      }
    );
    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([1000, 4000, 16000]);
  });
});
