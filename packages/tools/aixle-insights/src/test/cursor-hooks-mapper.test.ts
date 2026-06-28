import { describe, it, expect } from "vitest";
import type { HookLogEvent } from "../hooks/hooks-config.js";
import {
  shouldIngestHookEvent,
  mapHookEventToPayload,
  hookDedupeKey,
  CURSOR_HOOK_STATE_PREFIX,
} from "../hooks/cursor-hooks-mapper.js";
import { HOOK_COST_MODEL } from "../readers/cursor.js";
import { inferIngestPath } from "../cursor-payload-contract.js";

const SESSION_END_FIXTURE: HookLogEvent = {
  captured_at: "2026-05-27T00:01:00.000Z",
  hook_event_name: "sessionEnd",
  conversation_id: "cmp_abc123def",
  generation_id: "gen_001",
  model: "claude-sonnet-4-20250514",
  workspace_roots: ["~/db90-rails"],
  reason: "completed",
  cursor_version: "1.7.4",
};

const POST_TOOL_USE_FIXTURE: HookLogEvent = {
  captured_at: "2026-05-27T00:02:00.000Z",
  hook_event_name: "postToolUse",
  conversation_id: "cmp_abc123def",
  generation_id: "gen_002",
  model: "claude-sonnet-4-20250514",
  tool_name: "atlassian.searchJiraIssuesUsingJql",
  tool_input: "[redacted, 120 chars]",
  duration_ms: 842,
  workspace_roots: ["~/db90-rails"],
  cursor_version: "1.7.4",
};

describe("hookDedupeKey", () => {
  it("forms key from conversation_id + generation_id + hook_event_name", () => {
    const key = hookDedupeKey(SESSION_END_FIXTURE);
    expect(key).toBe(`${CURSOR_HOOK_STATE_PREFIX}cmp_abc123def:gen_001:sessionEnd`);
  });

  it("handles missing fields gracefully", () => {
    const key = hookDedupeKey({ hook_event_name: "sessionEnd" });
    expect(key).toContain(CURSOR_HOOK_STATE_PREFIX);
    expect(key).toContain("sessionEnd");
  });
});

describe("shouldIngestHookEvent", () => {
  it("accepts valid sessionEnd event", () => {
    expect(shouldIngestHookEvent(SESSION_END_FIXTURE)).toBe(true);
  });

  it("accepts valid postToolUse event", () => {
    expect(shouldIngestHookEvent(POST_TOOL_USE_FIXTURE)).toBe(true);
  });

  it("rejects event with parse_error hook_event_name", () => {
    expect(shouldIngestHookEvent({ hook_event_name: "parse_error" })).toBe(false);
  });

  it("rejects event with log_parse_error hook_event_name", () => {
    expect(shouldIngestHookEvent({ hook_event_name: "log_parse_error" })).toBe(false);
  });

  it("rejects event missing conversation_id", () => {
    const { conversation_id: _, ...noConv } = SESSION_END_FIXTURE;
    expect(shouldIngestHookEvent(noConv)).toBe(false);
  });

  it("rejects event missing hook_event_name", () => {
    const { hook_event_name: _, ...noEvent } = SESSION_END_FIXTURE;
    expect(shouldIngestHookEvent(noEvent)).toBe(false);
  });

  it("rejects event with model missing", () => {
    const { model: _, ...noModel } = SESSION_END_FIXTURE;
    expect(shouldIngestHookEvent(noModel)).toBe(false);
  });

  it("rejects event with model = 'unknown'", () => {
    expect(shouldIngestHookEvent({ ...SESSION_END_FIXTURE, model: "unknown" })).toBe(false);
  });
});

describe("mapHookEventToPayload", () => {
  it("maps sessionEnd fixture to correct payload shape", () => {
    const payload = mapHookEventToPayload(SESSION_END_FIXTURE);
    expect(payload.tool_name).toBe("cursor");
    expect(payload.event_type).toBe("chat");
    expect(payload.model).toBe("claude-sonnet-4-20250514");
    expect(payload.tokens_in).toBe(0);
    expect(payload.tokens_out).toBe(0);
    expect(payload.cost_usd).toBe(0);
    expect(payload.occurred_at).toBe("2026-05-27T00:01:00.000Z");
  });

  it("sets correct metadata for sessionEnd", () => {
    const payload = mapHookEventToPayload(SESSION_END_FIXTURE);
    const meta = payload.metadata;
    expect(meta.cursor_session_id).toBe("cmp_abc123def");
    expect(meta.workspace).toBe("~/db90-rails");
    expect(meta.workspace_scope).toBe("global");
    expect(meta.cost_model).toBe(HOOK_COST_MODEL);
    expect(meta.scannable).toBe(false);
    expect(meta.risk_level).toBe("none");
    expect(meta.ingest_source).toBe("cursor_hook");
    expect(meta.hook_event_name).toBe("sessionEnd");
    expect(meta.generation_id).toBe("gen_001");
    expect(meta.session_id).toBe(`${CURSOR_HOOK_STATE_PREFIX}cmp_abc123def:gen_001:sessionEnd`);
  });

  it("sets hook_tool_name from postToolUse event", () => {
    const payload = mapHookEventToPayload(POST_TOOL_USE_FIXTURE);
    expect(payload.metadata.hook_tool_name).toBe("atlassian.searchJiraIssuesUsingJql");
    expect(payload.metadata.duration_ms).toBe(842);
  });

  it("sets project_id when provided", () => {
    const payload = mapHookEventToPayload(SESSION_END_FIXTURE, "proj-uuid-123");
    expect(payload.project_id).toBe("proj-uuid-123");
  });

  it("omits project_id when not provided", () => {
    const payload = mapHookEventToPayload(SESSION_END_FIXTURE);
    expect(payload.project_id).toBeUndefined();
  });

  it("falls back workspace to 'unknown' when workspace_roots is empty", () => {
    const payload = mapHookEventToPayload({ ...SESSION_END_FIXTURE, workspace_roots: [] });
    expect(payload.metadata.workspace).toBe("unknown");
  });

  it("session_id is the same as hookDedupeKey", () => {
    const payload = mapHookEventToPayload(SESSION_END_FIXTURE);
    expect(payload.metadata.session_id).toBe(hookDedupeKey(SESSION_END_FIXTURE));
  });
});

describe("inferIngestPath for cursor_hook payloads", () => {
  it("returns cursor_hook (not legacy_request) for hook payloads", () => {
    const payload = mapHookEventToPayload(SESSION_END_FIXTURE);
    expect(inferIngestPath(payload)).toBe("cursor_hook");
  });

  it("does not classify postToolUse fixture as legacy_request", () => {
    const payload = mapHookEventToPayload(POST_TOOL_USE_FIXTURE);
    expect(inferIngestPath(payload)).not.toBe("legacy_request");
    expect(inferIngestPath(payload)).toBe("cursor_hook");
  });
});
