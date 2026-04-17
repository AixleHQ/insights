import type { Db90Payload } from "./claude-reader.js";

export interface PostResult {
  sent: number;
  failed: number;
}

export async function postEvent(
  event: Db90Payload,
  host: string,
  token: string
): Promise<boolean> {
  const url = `${host.replace(/\/$/, "")}/api/v1/ingest/events`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });
    if (response.ok) {
      return true;
    }
    const body = await response.text().catch(() => "");
    console.error(
      `Failed to post event: HTTP ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`
    );
    return false;
  } catch (err) {
    console.error(
      `Network error posting event: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

export async function postEvents(
  events: Db90Payload[],
  host: string,
  token: string
): Promise<PostResult> {
  if (events.length === 0) return { sent: 0, failed: 0 };

  const outcomes = await Promise.allSettled(
    events.map((event) => postEvent(event, host, token))
  );

  let sent = 0;
  let failed = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled" && outcome.value) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
