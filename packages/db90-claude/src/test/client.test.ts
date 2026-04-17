import { describe, it, expect, vi, beforeEach } from "vitest";
import { postEvent, postEvents } from "../client.js";
import type { Db90Payload } from "../claude-reader.js";

const samplePayload: Db90Payload = {
  tool_name: "claude_code",
  event_type: "chat",
  model: "claude-opus-4-5",
  tokens_in: 100,
  tokens_out: 50,
  tokens_total: 150,
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
