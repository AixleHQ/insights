import type { Db90Payload } from "./mapper.js";

export interface PostResult {
  sent: number;
  failed: number;
}

export async function postEvents(
  events: Db90Payload[],
  host: string,
  token: string
): Promise<PostResult> {
  if (events.length === 0) return { sent: 0, failed: 0 };

  const url = `${host.replace(/\/$/, "")}/api/v1/ingest/events`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const outcomes = await Promise.allSettled(
    events.map((event) =>
      fetch(url, { method: "POST", headers, body: JSON.stringify(event) })
    )
  );

  let sent = 0;
  let failed = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      console.error(`Network error posting event: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
      failed++;
    } else if (outcome.value.ok) {
      sent++;
    } else {
      const body = await outcome.value.text().catch(() => "");
      console.error(`Failed to post event: HTTP ${outcome.value.status} ${outcome.value.statusText}${body ? ` — ${body}` : ""}`);
      failed++;
    }
  }

  return { sent, failed };
}
