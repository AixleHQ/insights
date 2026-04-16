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
