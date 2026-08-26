import { evaluateTransportSecurity } from "./transport-security.js";

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
  /**
   * Skip the HTTPS-or-loopback gate for this host. Only ever set this to
   * `true` when the caller has independently confirmed the user explicitly
   * consented via `init --insecure` for this exact credential (see
   * `StoredCredentials.insecureHttpAllowed`). Defaults to `false`.
   */
  allowInsecureHttp?: boolean;
  /** Override default console.error on non-ok HTTP response. */
  onHttpError?: (status: number, statusText: string, body: string) => void;
  /** Override default console.error on network-level failure. */
  onNetworkError?: (err: unknown) => void;
  /**
   * Called when the server responds with 429 Too Many Requests.
   * @param retryAfter - seconds to wait before retrying (from Retry-After header, capped at 3600).
   * @param quotaExceeded - true when the monthly event quota is exhausted (code: "quota_exceeded").
   */
  on429?: (retryAfter: number, quotaExceeded: boolean) => void;
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
  const transportSecurity = evaluateTransportSecurity(host, {
    allowInsecureHttp: options.allowInsecureHttp === true,
    label: "Aixle Insights ingest host",
  });
  if (!transportSecurity.ok) {
    // Deliberately does NOT call options.onNetworkError/onHttpError: the retry
    // wrapper in src/client.ts treats those as transient and retries with
    // backoff. A scheme rejection is permanent — retrying wastes ~21s per
    // event for nothing. Bare console.error mirrors this file's existing
    // unrecoverable-failure logging style.
    console.error(`Blocked event send — ${transportSecurity.error}`);
    return false;
  }
  if (transportSecurity.warning) {
    console.error(`Warning: ${transportSecurity.warning}`);
  }

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

    if (response.status === 429) {
      const raw = response.headers.get("Retry-After") ?? "60";
      const parsed = parseInt(raw, 10);
      const retryAfter = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
      const bodyJson = await response.json().catch(() => ({})) as Record<string, unknown>;
      const quotaExceeded = bodyJson?.code === "quota_exceeded";
      options.on429?.(retryAfter, quotaExceeded);
      return false;
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
