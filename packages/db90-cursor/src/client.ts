import type { Db90Payload } from "./mapper.js";

export interface PostResult {
  sent: number;
  failed: number;
  /** ISO timestamp of the latest successfully-sent event's occurred_at, or null if none sent. */
  lastSentAt: string | null;
}

export async function postEvents(
  events: Db90Payload[],
  host: string,
  token: string
): Promise<PostResult> {
  if (events.length === 0) return { sent: 0, failed: 0, lastSentAt: null };

  const url = `${host.replace(/\/$/, "")}/api/v1/ingest/events`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const outcomes = await Promise.allSettled(
    events.map((event) =>
      fetch(url, { method: "POST", headers, body: JSON.stringify(event) }).then(
        (response) => ({ event, response })
      )
    )
  );

  let sent = 0;
  let failed = 0;
  let lastSentAt: string | null = null;

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      console.error(`Network error posting event: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
      failed++;
    } else if (outcome.value.response.ok) {
      sent++;
      const t = outcome.value.event.occurred_at;
      if (lastSentAt === null || t > lastSentAt) lastSentAt = t;
    } else {
      const body = await outcome.value.response.text().catch(() => "");
      console.error(`Failed to post event: HTTP ${outcome.value.response.status} ${outcome.value.response.statusText}${body ? ` — ${body}` : ""}`);
      failed++;
    }
  }

  return { sent, failed, lastSentAt };
}
