import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRICING } from "../pricing.js";
import { stateKey } from "../state.js";
import { sessionStateKey, syncOnce, resetBackoffStateForTests } from "../sync.js";
import { setIngestRetryWaitOverrideForTests } from "../client.js";

describe("syncOnce", () => {
  let appDir: string;
  let transcriptsRoot: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), "db90-mcp-sync-"));
    process.env.AIXLE_INSIGHTS_HOME = appDir;
    transcriptsRoot = join(appDir, "claude-projects");
    mkdirSync(join(transcriptsRoot, "proj"), { recursive: true });
    setIngestRetryWaitOverrideForTests(async () => {});
    const userLine = JSON.stringify({
      type: "user",
      sessionId: "sess-test-1",
      timestamp: "2026-05-15T11:59:00.000Z",
      message: {
        content: [{ type: "text", text: "Check the latest release gate status" }],
      },
    });
    const assistantLine = JSON.stringify({
      type: "assistant",
      sessionId: "sess-test-1",
      timestamp: "2026-05-15T12:00:00.000Z",
      message: {
        model: "claude-sonnet-4",
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: "text", text: "Release gate is green." }],
      },
    });
    writeFileSync(join(transcriptsRoot, "proj", "session.jsonl"), `${userLine}\n${assistantLine}\n`, "utf-8");

    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.AIXLE_INSIGHTS_HOME;
    resetBackoffStateForTests();
    setIngestRetryWaitOverrideForTests(undefined);
  });

  it("posts one ingest event then skips on second pass when transcript size unchanged", async () => {
    const host = "http://localhost:3000";
    const token = "db90_test_token";

    const r1 = await syncOnce({
      token,
      host,
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });
    expect(r1.failed).toBe(0);
    expect(r1.sent).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe(`${host}/api/v1/ingest/events`);
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.method).toBe("POST");
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      tool_name: "claude_code",
      event_type: "chat",
      metadata: {
        session_id: "sess-test-1:1",
        claude_session_id: "sess-test-1",
        prompt_text: "Check the latest release gate status",
        assistant_text: "Release gate is green.",
      },
    });

    const r2 = await syncOnce({
      token,
      host,
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });
    expect(r2.skipped).toBeGreaterThanOrEqual(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("persists checkpoint under claude_code:<turnId>", async () => {
    const host = "http://127.0.0.1:9";
    const token = "db90_test_token";

    await syncOnce({
      token,
      host,
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });

    const fname = `${stateKey(host, token)}.json`;
    const raw = JSON.parse(readFileSync(join(appDir, fname), "utf-8")) as {
      sessions: Record<string, unknown>;
    };
    expect(Object.keys(raw.sessions)).toContain(sessionStateKey("sess-test-1:1"));
  });

  it("stops posting remaining sessions after a 429 backoff response", async () => {
    const secondUserLine = JSON.stringify({
      type: "user",
      sessionId: "sess-test-2",
      timestamp: "2026-05-15T12:00:30.000Z",
      message: {
        content: [{ type: "text", text: "And what about the retry budget?" }],
      },
    });
    const secondAssistantLine = JSON.stringify({
      type: "assistant",
      sessionId: "sess-test-2",
      timestamp: "2026-05-15T12:01:00.000Z",
      message: {
        model: "claude-sonnet-4",
        usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: "text", text: "Retry budget remains healthy." }],
      },
    });
    writeFileSync(join(transcriptsRoot, "proj", "session-2.jsonl"), `${secondUserLine}\n${secondAssistantLine}\n`, "utf-8");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "quota_exceeded" }), {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "60", "Content-Type": "application/json" },
      })
    );

    const result = await syncOnce({
      token: "db90_test_token",
      host: "http://localhost:3000",
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });

    expect(result.failed).toBe(1);
    expect(result.rateLimitedUntil).toEqual(expect.any(String));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not persist operator state during dry-run sync", async () => {
    const host = "http://localhost:3000";
    const token = "db90_test_token";

    const r = await syncOnce({
      token,
      host,
      dryRun: true,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });

    expect(r.sent).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(existsSync(join(appDir, `${stateKey(host, token)}.json`))).toBe(false);
  });

  it("persists mcp_operator recent_errors to disk when ingest exhausts transient retries", async () => {
    fetchSpy.mockResolvedValue(
      new Response("no", { status: 503, statusText: "Service Unavailable" })
    );

    const host = "http://localhost:3000";
    const token = "db90_test_token";

    const r = await syncOnce({
      token,
      host,
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });

    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(4);

    const fname = `${stateKey(host, token)}.json`;
    const raw = JSON.parse(readFileSync(join(appDir, fname), "utf-8")) as {
      mcp_operator?: { recent_errors?: string[]; last_result?: { failed: number } };
    };
    expect(raw.mcp_operator?.recent_errors?.length).toBeGreaterThan(0);
    expect(raw.mcp_operator?.last_result?.failed).toBeGreaterThanOrEqual(1);
  });

  it("counts retry-then-success as sent with no failed increment", async () => {
    let n = 0;
    fetchSpy.mockImplementation(() => {
      n++;
      if (n === 1) {
        return Promise.resolve(new Response("x", { status: 503, statusText: "Service Unavailable" }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const r = await syncOnce({
      token: "db90_test_token",
      host: "http://localhost:3000",
      dryRun: false,
      verbose: false,
      projectId: null,
      pricing: DEFAULT_PRICING,
      appDir,
      transcriptBaseDirs: [transcriptsRoot],
    });

    expect(r.failed).toBe(0);
    expect(r.sent).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
