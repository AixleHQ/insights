import { postEvent as sdkPostEvent, type PostEventOptions } from "@db90/sdk";
import type { Db90Payload } from "./readers/claude.js";

export interface PostResult {
  sent: number;
  failed: number;
}

/**
 * Single-event POST. Thin wrapper around the SDK primitive so existing
 * imports from `./client.js` keep working.
 */
export async function postEvent(
  event: Db90Payload,
  host: string,
  token: string,
  options: PostEventOptions = {}
): Promise<boolean> {
  return sdkPostEvent(event, host, token, options);
}

/**
 * Batch POST with sent/failed aggregation. Cursor uses a different result
 * shape (with `lastSentAt` watermarking), so the batching wrapper stays
 * per-connector even though the per-event POST is shared.
 */
export async function postEvents(
  events: Db90Payload[],
  host: string,
  token: string,
  options: PostEventOptions = {}
): Promise<PostResult> {
  if (events.length === 0) return { sent: 0, failed: 0 };

  const outcomes = await Promise.allSettled(
    events.map((event) => postEvent(event, host, token, options))
  );

  let sent = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled" && outcome.value) sent++;
    else failed++;
  }
  return { sent, failed };
}
