export interface CursorRow {
  requestId?: string | null;
  timestamp?: number | string | null;
  model?: string | null;
  promptTokens?: number | null;
  generatedTokens?: number | null;
  type?: number | null;
  sessionId?: string | null;
  [key: string]: unknown;
}

export interface Db90Payload {
  tool_name: "cursor";
  event_type: "completion" | "chat";
  model: string;
  tokens_in: number;
  tokens_out: number;
  occurred_at: string;
  metadata: {
    cursor_session_id: string | null;
    workspace: string;
  };
}

// Cursor timestamps can be in seconds or milliseconds.
// Numbers below 1e12 are treated as seconds (year ~2001 and beyond).
const EPOCH_SECONDS_THRESHOLD = 1e12;

export function toEpochMs(timestamp: number | string | null | undefined): number | null {
  if (timestamp == null) return null;
  const num = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(num)) return null;
  return num < EPOCH_SECONDS_THRESHOLD ? num * 1000 : num;
}

function toIsoString(timestamp: number | string | null | undefined): string | null {
  const ms = toEpochMs(timestamp);
  if (ms === null) return null;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ─── Daily stats mapping (state.vscdb / ItemTable) ───────────────────────────

import type { DailyStatsEntry } from "./cursor-reader.js";

function pick(obj: unknown, ...keys: string[]): number | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

function buildPayload(
  eventType: "completion" | "chat",
  tokensIn: number,
  tokensOut: number,
  occurredAt: string,
  dbPath: string,
  model = "unknown"
): Db90Payload {
  return {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    occurred_at: occurredAt,
    metadata: { cursor_session_id: null, workspace: dbPath },
  };
}

/**
 * Maps a Cursor dailyStats ItemTable entry to one or more db90 payloads.
 *
 * Cursor tracks line counts, not token counts. We map:
 *   tabSuggestedLines  → tokens_in  (lines offered by tab completion)
 *   tabAcceptedLines   → tokens_out (lines the user kept)
 *   composerSuggestedLines → tokens_in  (lines composed/suggested)
 *   composerAcceptedLines  → tokens_out (lines the user accepted)
 *
 * Older or future Cursor versions may use model-keyed token counts instead;
 * that layout is handled as a fallback.
 */
export function mapDailyStats(entry: DailyStatsEntry): Db90Payload[] {
  const { date, value, dbPath } = entry;
  const occurredAt = `${date}T00:00:00.000Z`;
  const results: Db90Payload[] = [];

  if (typeof value !== "object" || value === null) return results;

  const obj = value as Record<string, unknown>;

  const tabSuggested      = pick(obj, "tabSuggestedLines") ?? 0;
  const tabAccepted       = pick(obj, "tabAcceptedLines") ?? 0;
  const composerSuggested = pick(obj, "composerSuggestedLines") ?? 0;
  const composerAccepted  = pick(obj, "composerAcceptedLines") ?? 0;

  if (tabSuggested > 0 || tabAccepted > 0)
    results.push(buildPayload("completion", tabSuggested, tabAccepted, occurredAt, dbPath));

  if (composerSuggested > 0 || composerAccepted > 0)
    results.push(buildPayload("chat", composerSuggested, composerAccepted, occurredAt, dbPath));

  if (results.length > 0) return results;

  // Fallback: model-keyed token counts (possible future/other Cursor layouts)
  // e.g. { "claude-3-5-sonnet": { inputTokens: 5000, outputTokens: 1200 } }
  // Keys like "tab", "composer", "date" are Cursor metadata fields, not model names.
  const KNOWN_NON_MODEL_KEYS = new Set(["tab", "composer", "chat", "date", "inputTokens", "outputTokens"]);
  for (const [model, stats] of Object.entries(obj)) {
    if (KNOWN_NON_MODEL_KEYS.has(model) || typeof stats !== "object" || stats === null) continue;
    const tokensIn  = pick(stats, "inputTokens") ?? pick(stats, "promptTokens") ?? 0;
    const tokensOut = pick(stats, "outputTokens") ?? pick(stats, "generatedTokens") ?? 0;
    if (tokensIn === 0 && tokensOut === 0) continue;
    results.push(buildPayload("chat", tokensIn, tokensOut, occurredAt, dbPath, model));
  }

  return results;
}

export function mapEvent(row: CursorRow, workspacePath: string): Db90Payload | null {
  const occurredAt = toIsoString(row.timestamp);
  if (!occurredAt) return null;

  const model = row.model;
  if (!model) return null;

  const eventType: "completion" | "chat" = row.type === 1 ? "chat" : "completion";

  return {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: row.promptTokens ?? 0,
    tokens_out: row.generatedTokens ?? 0,
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: row.sessionId ?? row.requestId ?? null,
      workspace: workspacePath,
    },
  };
}
