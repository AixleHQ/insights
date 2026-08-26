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

  it("returns undefined for global hook event (workspace is the 'unknown' placeholder)", () => {
    const payload = makePayload({
      ingest_source: "cursor_hook",
      workspace: "unknown",
      workspace_scope: "global",
    });
    // "unknown" is not an absolute path. It used to be returned as-is and
    // rejected downstream by git failing; it is now rejected here (AIX-547).
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });
});

describe("cursorRepoPathFromPayload — normalization and traversal (AIX-547)", () => {
  it("collapses .. segments instead of passing them to git -C", () => {
    const payload = makePayload({ workspace_folder: "/Users/me/dev/proj/../../../../etc/evil" });
    expect(cursorRepoPathFromPayload(payload)).toBe("/etc/evil");
  });

  it("returns undefined for a relative workspace path", () => {
    const payload = makePayload({ workspace_folder: "dev/my-project" });
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });

  it("returns undefined for an option-shaped workspace path", () => {
    const payload = makePayload({ workspace_folder: "--upload-pack=touch /tmp/pwn" });
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });

  it("returns undefined for a workspace path containing NUL", () => {
    const payload = makePayload({ workspace_folder: "/Users/me/dev/proj\0/evil" });
    expect(cursorRepoPathFromPayload(payload)).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const payload = makePayload({ workspace_folder: "  /Users/me/dev/my-project  " });
    expect(cursorRepoPathFromPayload(payload)).toBe("/Users/me/dev/my-project");
  });

  it("falls back to workspace when workspace_folder is unusable", () => {
    const payload = makePayload({
      workspace_folder: "--upload-pack=id",
      workspace: "/Users/me/dev/fallback-project",
    });
    expect(cursorRepoPathFromPayload(payload)).toBe("/Users/me/dev/fallback-project");
  });
});

describe("scopeDir containment end-to-end (AIX-547)", () => {
  it("a traversal path escaping scopeDir is not treated as in-scope", async () => {
    const { isRepoPathWithinRoot } = await import("../lib/repo-path-safety.js");
    const scopeDir = "/Users/me/dev/my-project";
    const payload = makePayload({
      workspace_folder: `${scopeDir}/../../../../etc/evil`,
    });

    const ws = cursorRepoPathFromPayload(payload);
    expect(ws).toBe("/etc/evil");
    // The old check passed: "/Users/me/dev/my-project/../../../../etc/evil"
    // .startsWith("/Users/me/dev/my-project/") === true.
    expect(ws !== undefined && isRepoPathWithinRoot(ws, scopeDir)).toBe(false);
  });

  it("a legitimate subdirectory of scopeDir is still in scope", async () => {
    const { isRepoPathWithinRoot } = await import("../lib/repo-path-safety.js");
    const scopeDir = "/Users/me/dev/my-project";
    const payload = makePayload({ workspace_folder: `${scopeDir}/packages/api` });

    const ws = cursorRepoPathFromPayload(payload);
    expect(ws).toBe(`${scopeDir}/packages/api`);
    expect(ws !== undefined && isRepoPathWithinRoot(ws, scopeDir)).toBe(true);
  });
});
