import { describe, expect, it } from "vitest";
import { cursorRepoPathFromPayload } from "../sync.js";
import type { CursorDb90Payload } from "../readers/cursor.js";

function makePayload(metadata: Record<string, unknown>): CursorDb90Payload {
  return {
    tool_name: "cursor",
    event_type: "chat",
    model: "claude-3-5-sonnet",
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    occurred_at: "2026-06-07T10:00:00Z",
    metadata: metadata as CursorDb90Payload["metadata"],
  };
}

describe("cursorRepoPathFromPayload", () => {
  it("returns workspace from cursor hook event (ingest_source=cursor_hook, no transcript_source)", () => {
    const payload = makePayload({
      ingest_source: "cursor_hook",
      workspace: "/Users/me/dev/my-project",
      workspace_scope: "workspace",
      session_id: "abc123",
    });
    expect(cursorRepoPathFromPayload(payload)).toBe("/Users/me/dev/my-project");
  });

  it("returns workspace_folder from regular Cursor SQLite event", () => {
    const payload = makePayload({
      workspace_folder: "/Users/me/dev/another-project",
    });
    expect(cursorRepoPathFromPayload(payload)).toBe("/Users/me/dev/another-project");
  });

  it("returns workspace from agent transcript payload (has transcript_source)", () => {
    const payload = makePayload({
      transcript_source: "cursor_agent",
      workspace: "/Users/me/dev/agent-project",
    });
    expect(cursorRepoPathFromPayload(payload)).toBe("/Users/me/dev/agent-project");
  });

  it("prefers workspace_folder over workspace when both are present", () => {
    const payload = makePayload({
      workspace_folder: "/Users/me/dev/folder-project",
      workspace: "/Users/me/dev/workspace-project",
    });
    expect(cursorRepoPathFromPayload(payload)).toBe("/Users/me/dev/folder-project");
  });

  it("returns undefined when no workspace metadata is present", () => {
    const payload = makePayload({ session_id: "xyz" });
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });

  it("returns undefined when workspace is an empty string", () => {
    const payload = makePayload({ workspace: "" });
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });

  it("returns undefined when payload has no metadata", () => {
    const payload = makePayload({});
    (payload as unknown as Record<string, unknown>).metadata = undefined;
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });

  it("returns undefined for global hook event (no workspace_roots)", () => {
    const payload = makePayload({
      ingest_source: "cursor_hook",
      workspace: "unknown",
      workspace_scope: "global",
    });
    // "unknown" is not a meaningful path — but the function returns it as-is
    // (filtering "unknown" is handled upstream by git remote lookup returning null)
    expect(cursorRepoPathFromPayload(payload)).toBe("unknown");
  });
});
