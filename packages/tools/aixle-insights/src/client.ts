import {
  postEvent as sdkPostEvent,
  type IngestPayload,
  type PostEventOptions,
} from "./lib/index.js";
import { mcpLog } from "./log.js";

export interface PostResult {
  sent: number;
  failed: number;
}

export interface PostEventsResult extends PostResult {
  /** ISO timestamp of the latest successfully-sent event's occurred_at, or null if none sent. */
  lastSentAt: string | null;
}

/** Delays after each failed attempt (not 429): initial try, then wait 1s, 4s, 16s before retries. */
const TRANSIENT_RETRY_DELAYS_MS = [1000, 4000, 16_000] as const;

const RETRY_DELAY_LABELS = ["1s", "4s", "16s"] as const;

export interface PostEventExtras {
  /** Injected wait for tests (default: real setTimeout). */
  waitMs?: (ms: number) => Promise<void>;
  /** When false, skip operational logging of transient retries. */
  logTransientRetries?: boolean;
}

export type PostEventOptionsWithRetry = PostEventOptions & PostEventExtras;

/** Optional zero-delay retries in Vitest (real `setTimeout` does not play well with `vi.useFakeTimers`). */
let ingestRetryWaitOverride: ((ms: number) => Promise<void>) | undefined;

/** @internal */
export function setIngestRetryWaitOverrideForTests(fn: ((ms: number) => Promise<void>) | undefined): void {
  ingestRetryWaitOverride = fn;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single-event POST with intra-sync retries for transient failures (5xx / network).
 * Does not retry 429: the SDK invokes `on429` and returns false immediately.
 */
export async function postEvent(
  payload: IngestPayload,
  host: string,
  token: string,
  options: PostEventOptionsWithRetry = {}
): Promise<boolean> {
  const wait = options.waitMs ?? ingestRetryWaitOverride ?? defaultWait;
  const logRetries = options.logTransientRetries !== false;

  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt++) {
    let was429 = false;
    let httpStatus: number | null = null;
    let networkFailed = false;
    const merged: PostEventOptions = {
      ...options,
      onHttpError: (status, statusText, body) => {
        httpStatus = status;
        if (options.onHttpError) {
          options.onHttpError(status, statusText, body);
        } else {
          console.error(
            `Failed to post event: HTTP ${status} ${statusText}${body ? ` — ${body}` : ""}`
          );
        }
      },
      onNetworkError: (err) => {
        networkFailed = true;
        if (options.onNetworkError) {
          options.onNetworkError(err);
        } else {
          console.error(
            `Network error posting event: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      },
      on429: (retryAfter, quotaExceeded) => {
        was429 = true;
        options.on429?.(retryAfter, quotaExceeded);
      },
    };

    const ok = await sdkPostEvent(payload, host, token, merged);
    if (ok) return true;
    if (was429) return false;
    if (!networkFailed && (httpStatus === null || httpStatus < 500)) return false;

    if (attempt >= TRANSIENT_RETRY_DELAYS_MS.length) return false;

    const delayMs = TRANSIENT_RETRY_DELAYS_MS[attempt];
    const delayLabel = RETRY_DELAY_LABELS[attempt];

    if (logRetries) {
      mcpLog.warn(
        "ingest_transient_retry",
        {
          attempt: attempt + 1,
          delay: delayLabel,
          delay_ms: delayMs,
          occurred_at: payload.occurred_at,
        },
        true
      );
    }

    await wait(delayMs);
  }

  return false;
}

/**
 * Batch POST with sent/failed aggregation plus max `occurred_at` watermarking
 * (used by Cursor multi-event sync loops).
 */
export async function postEvents(
  events: IngestPayload[],
  host: string,
  token: string,
  options: PostEventOptionsWithRetry = {}
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
