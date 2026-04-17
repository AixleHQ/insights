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

// Attempts to extract a number from an unknown value at a given key path.
function pick(obj: unknown, ...keys: string[]): number | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

/**
 * Maps a Cursor dailyStats ItemTable entry to one or more db90 payloads.
 *
 * The JSON shape varies by Cursor version. We handle two known layouts:
 *
 * Layout A — model-keyed (newer Cursor):
 *   { "<model>": { inputTokens, outputTokens, requests, … }, … }
 *
 * Layout B — type-keyed (older Cursor):
 *   { tab: { completionCount, … }, composer: { messageCount, … } }
 *
 * Unknown layouts fall back to a single aggregated event with whatever
 * numeric token fields are found at the top level.
 */
export function mapDailyStats(entry: DailyStatsEntry): Db90Payload[] {
  const { date, value, dbPath } = entry;
  const occurredAt = `${date}T00:00:00.000Z`;
  const results: Db90Payload[] = [];

  if (typeof value !== "object" || value === null) return results;

  const obj = value as Record<string, unknown>;

  // Layout A: model-keyed stats
  // e.g. { "claude-3-5-sonnet-20241022": { inputTokens: 5000, outputTokens: 1200, requests: 12 } }
  const MODEL_KEY_RE = /^[a-z][\w.-]+$/; // looks like a model name, not a stat name
  const STAT_NAMES = new Set(["tab", "composer", "chat", "inputTokens", "outputTokens", "requests", "total"]);
  const modelKeys = Object.keys(obj).filter(
    (k) => MODEL_KEY_RE.test(k) && !STAT_NAMES.has(k) && typeof obj[k] === "object"
  );

  if (modelKeys.length > 0) {
    for (const model of modelKeys) {
      const stats = obj[model] as Record<string, unknown>;
      const tokensIn = pick(stats, "inputTokens") ?? pick(stats, "promptTokens") ?? 0;
      const tokensOut = pick(stats, "outputTokens") ?? pick(stats, "generatedTokens") ?? 0;
      if (tokensIn === 0 && tokensOut === 0) continue;
      results.push({
        tool_name: "cursor",
        event_type: "chat",
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        occurred_at: occurredAt,
        metadata: { cursor_session_id: null, workspace: dbPath },
      });
    }
    if (results.length > 0) return results;
  }

  // Layout B: type-keyed stats
  const tabCompletions = pick(obj, "tab", "completionCount") ?? pick(obj, "tabCompletionCount") ?? 0;
  const composerTokensIn = pick(obj, "composer", "inputTokens") ?? pick(obj, "composerInputTokens") ?? 0;
  const composerTokensOut = pick(obj, "composer", "outputTokens") ?? pick(obj, "composerOutputTokens") ?? 0;

  if (tabCompletions > 0) {
    results.push({
      tool_name: "cursor",
      event_type: "completion",
      model: "unknown",
      tokens_in: 0,
      tokens_out: tabCompletions, // count as "output" proxy for completions
      occurred_at: occurredAt,
      metadata: { cursor_session_id: null, workspace: dbPath },
    });
  }
  if (composerTokensIn > 0 || composerTokensOut > 0) {
    results.push({
      tool_name: "cursor",
      event_type: "chat",
      model: "unknown",
      tokens_in: composerTokensIn,
      tokens_out: composerTokensOut,
      occurred_at: occurredAt,
      metadata: { cursor_session_id: null, workspace: dbPath },
    });
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
