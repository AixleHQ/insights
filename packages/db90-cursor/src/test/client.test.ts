import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postEvents } from "../client.js";
import type { Db90Payload } from "../mapper.js";

const sampleEvent: Db90Payload = {
  tool_name: "cursor",
  event_type: "completion",
  model: "gpt-4",
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0,
  occurred_at: "2024-01-01T00:00:00.000Z",
  metadata: {
    cursor_session_id: "session-123",
    workspace: "/home/user/project",
    cost_model: "estimated_line_count",
  },
};

describe("postEvents", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns sent=0, failed=0, lastSentAt=null for empty events array", async () => {
    const result = await postEvents([], "https://app.db90.io", "token-abc");
    expect(result).toEqual({ sent: 0, failed: 0, lastSentAt: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts each event individually to the correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", mockFetch);

    const events = [sampleEvent, { ...sampleEvent, model: "claude-3" }];
    const result = await postEvents(events, "https://app.db90.io", "my-token");

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.lastSentAt).toBe(events[1].occurred_at);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.db90.io/api/v1/ingest/events");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-token");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body as string)).toMatchObject({ tool_name: "cursor" });
  });

  it("strips trailing slash from host", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await postEvents([sampleEvent], "https://app.db90.io/", "token");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.db90.io/api/v1/ingest/events");
  });

  it("counts HTTP non-ok responses as failed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await postEvents([sampleEvent], "https://app.db90.io", "bad-token");
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.lastSentAt).toBeNull();
  });

  it("counts network errors as failed", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await postEvents([sampleEvent], "https://app.db90.io", "token");
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("handles mixed success and failure", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve(""),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const events = [sampleEvent, sampleEvent];
    const result = await postEvents(events, "https://app.db90.io", "token");
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.lastSentAt).toBe(sampleEvent.occurred_at);
  });
});
