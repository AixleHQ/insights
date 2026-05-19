import { postEvent as sdkPostEvent, type IngestPayload, type PostEventOptions } from "@db90/sdk";

export interface PostResult {
  sent: number;
  failed: number;
}

export interface PostEventsResult extends PostResult {
  /** ISO timestamp of the latest successfully-sent event's occurred_at, or null if none sent. */
  lastSentAt: string | null;
}

/**
 * Single-event POST. Thin wrapper around the SDK primitive so existing
 * imports from `./client.js` keep working.
 */
export async function postEvent(
  payload: IngestPayload,
  host: string,
  token: string,
  options: PostEventOptions = {}
): Promise<boolean> {
  return sdkPostEvent(payload, host, token, options);
}

/**
 * Batch POST with sent/failed aggregation plus max `occurred_at` watermarking
 * (used by Cursor multi-event sync loops).
 */
export async function postEvents(
  events: IngestPayload[],
  host: string,
  token: string,
  options: PostEventOptions = {}
): Promise<PostEventsResult> {
  if (events.length === 0) return { sent: 0, failed: 0, lastSentAt: null };

  const outcomes = await Promise.allSettled(
    events.map((event) => postEvent(event, host, token, options).then((ok) => ({ event, ok })))
  );

  let sent = 0;
  let failed = 0;
  let lastSentAt: string | null = null;

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      failed++;
      continue;
    }
    if (outcome.value.ok) {
      sent++;
      const t = outcome.value.event.occurred_at;
      if (typeof t === "string" && (lastSentAt === null || t > lastSentAt)) {
        lastSentAt = t;
      }
    } else {
      failed++;
    }
  }
  return { sent, failed, lastSentAt };
}
