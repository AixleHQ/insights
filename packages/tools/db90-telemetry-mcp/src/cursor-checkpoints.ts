import type { State } from "./state.js";
import type { CursorDb90Payload } from "./readers/cursor.js";

/** Cursor SQLite watermark checkpoints — never collide with Claude `claude_code:*` session keys. */
export const CURSOR_WATERMARK_KEY = "cursor:watermark" as const;
export const CURSOR_EVENTS_WATERMARK_KEY = "cursor:events_watermark" as const;
export const CURSOR_DAILY_STATS_WATERMARK_KEY = "cursor:daily_stats_watermark" as const;
export const CURSOR_RECENT_COMMIT_WATERMARK_KEY = "cursor:recent_commit_watermark" as const;
export const CURSOR_TRANSCRIPT_TURN_PREFIX = "cursor:transcript_turn:" as const;

export function cursorTranscriptTurnStateKey(turnId: string): string {
  return `${CURSOR_TRANSCRIPT_TURN_PREFIX}${turnId}`;
}

export function cursorWatermarkDate(
  state: Pick<State, "sessions">,
  ...keys: string[]
): Date | null {
  const rec = keys
    .map((key) => state.sessions[key])
    .find((value) => value !== undefined);
  if (!rec) return null;
  const d = new Date(rec.sentAt);
  return isNaN(d.getTime()) ? null : d;
}

/** Skip recent-commit payloads whose hash was already successfully POSTed. */
export function filterRecentCommitsByHashDedup(
  payloads: CursorDb90Payload[],
  lastRecentCommitHashes?: string[]
): CursorDb90Payload[] {
  if (!lastRecentCommitHashes || lastRecentCommitHashes.length === 0) return payloads;
  const seen = new Set(lastRecentCommitHashes);
  return payloads.filter((p) => {
    const hash = p.metadata.commit_hash;
    return !hash || !seen.has(hash);
  });
}
