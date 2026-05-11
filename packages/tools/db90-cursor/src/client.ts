import { postEvent as sdkPostEvent, type PostEventOptions } from "@db90/sdk";
import type { Db90Payload } from "./mapper.js";

export interface PostResult {
  sent: number;
  failed: number;
  /** ISO timestamp of the latest successfully-sent event's occurred_at, or null if none sent. */
  lastSentAt: string | null;
}

/**
 * Batch POST with per-event watermarking. Delegates the HTTP plumbing to
 * the SDK primitive and adds cursor-specific logic for tracking the newest
 * successfully-sent `occurred_at` so the sync loop can advance state on
 * partial failure.
 */
export async function postEvents(
  events: Db90Payload[],
  host: string,
  token: string,
  options: PostEventOptions = {}
): Promise<PostResult> {
  if (events.length === 0) return { sent: 0, failed: 0, lastSentAt: null };

  const outcomes = await Promise.allSettled(
    events.map(async (event) => ({
      event,
      ok: await sdkPostEvent(event, host, token, options),
    }))
  );

  let sent = 0;
  let failed = 0;
  let lastSentAt: string | null = null;

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      // sdkPostEvent never rejects, so this branch only fires if the wrapper
      // itself throws (out-of-memory, etc.). Count as failure.
      failed++;
      continue;
    }
    if (outcome.value.ok) {
      sent++;
      const t = outcome.value.event.occurred_at;
      if (lastSentAt === null || t > lastSentAt) lastSentAt = t;
    } else {
      failed++;
    }
  }

  return { sent, failed, lastSentAt };
}
