/**
 * Minimum payload contract for ingestion — every connector produces events that
 * at least carry an ISO timestamp. Connectors add their own fields; we don't
 * constrain them here so the SDK stays tool-agnostic.
 */
export interface IngestPayload {
  occurred_at: string;
  [key: string]: unknown;
}

export interface PostEventOptions {
  /** Override default console.error on non-ok HTTP response. */
  onHttpError?: (status: number, statusText: string, body: string) => void;
  /** Override default console.error on network-level failure. */
  onNetworkError?: (err: unknown) => void;
}

/**
 * POST a single event payload to the db90 ingest endpoint.
 *
 * Shared HTTP primitive for all connectors. Each connector wraps this in its
 * own batching / watermarking logic (cursor tracks `lastSentAt` across a
 * batch; claude aggregates `sent`/`failed` counts). Result shapes differ by
 * connector, so they are NOT unified here.
 *
 * Returns true on 2xx response, false on any HTTP error or network failure.
 * Never throws — callers can rely on Promise.allSettled-style aggregation.
 */
export async function postEvent(
  payload: IngestPayload,
  host: string,
  token: string,
  options: PostEventOptions = {}
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
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      return true;
    }
    const body = await response.text().catch(() => "");
    const onHttpError =
      options.onHttpError ??
      ((status, statusText, errBody) => {
        console.error(
          `Failed to post event: HTTP ${status} ${statusText}${errBody ? ` — ${errBody}` : ""}`
        );
      });
    onHttpError(response.status, response.statusText, body);
    return false;
  } catch (err) {
    const onNetworkError =
      options.onNetworkError ??
      ((error) => {
        console.error(
          `Network error posting event: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    onNetworkError(err);
    return false;
  }
}
