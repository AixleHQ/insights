import type { HookLogEvent } from "./hooks-config.js";
import type { CursorDb90Payload } from "../readers/cursor.js";
import { HOOK_COST_MODEL } from "../readers/cursor.js";
import { mcpLog } from "../log.js";

export { HookLogEvent };

/** State key prefix for hook event dedup in state.sessions. */
export const CURSOR_HOOK_STATE_PREFIX = "cursor:hook:" as const;

const MIN_CURSOR_VERSION_MAJOR = 1;
const MIN_CURSOR_VERSION_MINOR = 7;

/**
 * Returns the dedup key used both in state.sessions and metadata.session_id
 * so MCP state wipe doesn't cause duplicates (server-side upsert on session_id).
 */
export function hookDedupeKey(event: HookLogEvent): string {
  return `${CURSOR_HOOK_STATE_PREFIX}${event.conversation_id ?? ""}:${event.generation_id ?? ""}:${event.hook_event_name ?? ""}`;
}

/**
 * Returns false for events that carry no attribution value or can't be deduped.
 * Logs a reason at debug level so ops can diagnose unexpected drops.
 */
export function shouldIngestHookEvent(event: HookLogEvent, verbose = false): boolean {
  if (
    event.hook_event_name === "parse_error" ||
    event.hook_event_name === "log_parse_error"
  ) {
    mcpLog.warn("hook_event_dropped", { reason: "parse_error", event: event.hook_event_name }, verbose);
    return false;
  }
  if (!event.conversation_id || !event.hook_event_name) {
    mcpLog.warn("hook_event_dropped", { reason: "missing_dedup_fields" }, verbose);
    return false;
  }
  if (!event.model || event.model === "unknown") {
    mcpLog.info("hook_event_dropped", { reason: "no_model_attribution", hook: event.hook_event_name }, verbose);
    return false;
  }
  return true;
}

/** Warn-only version gate — Cursor builds can have unusual version strings. */
export function warnOnCursorVersion(event: HookLogEvent, verbose: boolean): void {
  const v = event.cursor_version;
  if (typeof v !== "string") return;
  const parts = v.split(".");
  const major = parseInt(parts[0] ?? "0", 10);
  const minor = parseInt(parts[1] ?? "0", 10);
  if (major < MIN_CURSOR_VERSION_MAJOR || (major === MIN_CURSOR_VERSION_MAJOR && minor < MIN_CURSOR_VERSION_MINOR)) {
    mcpLog.warn(
      "hook_cursor_version_old",
      { cursor_version: v, required: `${MIN_CURSOR_VERSION_MAJOR}.${MIN_CURSOR_VERSION_MINOR}` },
      true
    );
    if (verbose) {
      console.warn(
        `[db90-mcp][cursor-hooks] cursor_version ${v} is older than ${MIN_CURSOR_VERSION_MAJOR}.${MIN_CURSOR_VERSION_MINOR} — hook payload shape may differ`
      );
    }
  }
}

/**
 * Map a validated hook event to the CursorDb90Payload contract.
 * Call shouldIngestHookEvent() before this — it does not re-validate.
 */
export function mapHookEventToPayload(
  event: HookLogEvent,
  projectId?: string | null
): CursorDb90Payload {
  const workspace =
    Array.isArray(event.workspace_roots) && typeof event.workspace_roots[0] === "string"
      ? (event.workspace_roots[0] as string)
      : "unknown";

  const dedupeKey = hookDedupeKey(event);

  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: "chat",
    model: event.model as string,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    occurred_at: event.captured_at ?? new Date().toISOString(),
    metadata: {
      cursor_session_id: event.conversation_id ?? null,
      workspace,
      workspace_scope: "global",
      cost_model: HOOK_COST_MODEL,
      scannable: false,
      risk_level: "none",
      ingest_source: "cursor_hook",
      hook_event_name: event.hook_event_name,
      generation_id: event.generation_id,
      hook_tool_name: event.tool_name,
      duration_ms: typeof event.duration_ms === "number" ? event.duration_ms : undefined,
      session_id: dedupeKey,
    },
  };

  if (projectId) payload.project_id = projectId;

  return payload;
}
