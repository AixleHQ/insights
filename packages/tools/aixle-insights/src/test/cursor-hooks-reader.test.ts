import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processHooksQueue } from "../hooks/cursor-hooks-reader.js";
import { hookDedupeKey } from "../hooks/cursor-hooks-mapper.js";
import type { State } from "../state.js";

vi.mock("../client.js", () => ({
  postEvent: vi.fn(),
}));

import { postEvent } from "../client.js";
const mockPostEvent = vi.mocked(postEvent);

const FIXTURE_SESSION_END = JSON.stringify({
  captured_at: "2026-05-27T00:01:00.000Z",
  hook_event_name: "sessionEnd",
  conversation_id: "cmp_aaa",
  generation_id: "gen_001",
  model: "claude-sonnet-4-20250514",
  workspace_roots: ["/home/user/repo"],
  cursor_version: "1.7.4",
});

const FIXTURE_POST_TOOL = JSON.stringify({
  captured_at: "2026-05-27T00:02:00.000Z",
  hook_event_name: "postToolUse",
  conversation_id: "cmp_aaa",
  generation_id: "gen_002",
  model: "claude-sonnet-4-20250514",
  tool_name: "terminal",
  duration_ms: 300,
  workspace_roots: ["/home/user/repo"],
  cursor_version: "1.7.4",
});

const FIXTURE_UNKNOWN_MODEL = JSON.stringify({
  captured_at: "2026-05-27T00:03:00.000Z",
  hook_event_name: "sessionEnd",
  conversation_id: "cmp_bbb",
  generation_id: "gen_003",
  model: "unknown",
  workspace_roots: ["/home/user/repo"],
});

function emptyState(): State {
  return { version: 1, sessions: {} };
}

let appDir: string;

beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "db90-hooks-test-"));
  mockPostEvent.mockReset();
});

afterEach(() => {
  rmSync(appDir, { recursive: true, force: true });
});

describe("processHooksQueue — empty / missing queue", () => {
  it("returns zero counts when queue file absent", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("returns zero counts when queue file is empty", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(queuePath, "", "utf-8");
    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });
    expect(result.sent).toBe(0);
  });
});

describe("processHooksQueue — full success", () => {
  it("sends all valid events and empties queue", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(
      queuePath,
      [FIXTURE_SESSION_END, FIXTURE_POST_TOOL].join("\n") + "\n",
      "utf-8"
    );
    mockPostEvent.mockResolvedValue(true);

    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);

    // Queue should be empty after full success
    const remaining = readFileSync(queuePath, "utf-8").trim();
    expect(remaining).toBe("");
  });

  it("records sent events in state.sessions", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(queuePath, FIXTURE_SESSION_END + "\n", "utf-8");
    mockPostEvent.mockResolvedValue(true);

    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    const parsedFixture = JSON.parse(FIXTURE_SESSION_END);
    const expectedKey = hookDedupeKey(parsedFixture);
    expect(result.state.sessions[expectedKey]).toBeDefined();
    expect(result.state.sessions[expectedKey]!.fileSize).toBe(0);
    expect(result.state.sessions[expectedKey]!.sentAt).toBeTruthy();
  });

  it("skips unknown model events", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(
      queuePath,
      [FIXTURE_SESSION_END, FIXTURE_UNKNOWN_MODEL].join("\n") + "\n",
      "utf-8"
    );
    mockPostEvent.mockResolvedValue(true);

    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

describe("processHooksQueue — partial failure", () => {
  it("retains failed lines in queue, removes succeeded lines", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(
      queuePath,
      [FIXTURE_SESSION_END, FIXTURE_POST_TOOL].join("\n") + "\n",
      "utf-8"
    );
    // First call succeeds, second fails
    mockPostEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);

    // Queue should retain the failed line
    const remaining = readFileSync(queuePath, "utf-8").trim();
    const remainingLines = remaining.split("\n").filter((l) => l.trim());
    expect(remainingLines).toHaveLength(1);
    const retainedEvent = JSON.parse(remainingLines[0]!);
    expect(retainedEvent.hook_event_name).toBe("postToolUse");
  });
});

describe("processHooksQueue — dedup", () => {
  it("skips events already in state.sessions", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(queuePath, FIXTURE_SESSION_END + "\n", "utf-8");
    const parsedFixture = JSON.parse(FIXTURE_SESSION_END);
    const key = hookDedupeKey(parsedFixture);
    const stateWithKey: State = {
      version: 1,
      sessions: { [key]: { fileSize: 0, sentAt: new Date().toISOString() } },
    };

    const result = await processHooksQueue({
      queuePath,
      state: stateWithKey,
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockPostEvent).not.toHaveBeenCalled();
  });
});

describe("processHooksQueue — scopeDir filtering", () => {
  it("skips events whose workspace_roots[0] is not under scopeDir", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(queuePath, FIXTURE_SESSION_END + "\n", "utf-8");
    mockPostEvent.mockResolvedValue(true);

    const result = await processHooksQueue({
      queuePath,
      scopeDir: "/different/repo",
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockPostEvent).not.toHaveBeenCalled();
  });

  it("sends events matching scopeDir", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(queuePath, FIXTURE_SESSION_END + "\n", "utf-8");
    mockPostEvent.mockResolvedValue(true);

    const result = await processHooksQueue({
      queuePath,
      scopeDir: "/home/user/repo",
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
    });

    expect(result.sent).toBe(1);
  });
});

describe("processHooksQueue — project resolution", () => {
  it("resolves project_id from hook workspace before posting", async () => {
    const queuePath = join(appDir, "hooks-queue.ndjson");
    writeFileSync(queuePath, FIXTURE_SESSION_END + "\n", "utf-8");
    mockPostEvent.mockResolvedValue(true);
    const resolveProjectId = vi.fn().mockResolvedValue("project-123");

    const result = await processHooksQueue({
      queuePath,
      state: emptyState(),
      host: "http://localhost:3000",
      token: "tok",
      on429: () => {},
      resolveProjectId,
    });

    expect(result.sent).toBe(1);
    expect(resolveProjectId).toHaveBeenCalledWith("/home/user/repo");
    expect(mockPostEvent).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-123" }),
      "http://localhost:3000",
      "tok",
      expect.any(Object)
    );
  });
});
