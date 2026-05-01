import type { IngestPayload } from "@db90/sdk";

const COST_MODEL = "estimated_line_count" as const;

export interface PricingConfig {
  tokens_per_line: number;
  completion_output_per_mtok: number;
  chat_input_per_mtok: number;
  chat_output_per_mtok: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  tokens_per_line: 15,
  completion_output_per_mtok: 0.60,
  chat_input_per_mtok: 3.00,
  chat_output_per_mtok: 15.00,
};

export interface CursorRow {
  requestId?: string | null;
  timestamp?: number | string | null;
  model?: string | null;
  promptTokens?: number | null;
  generatedTokens?: number | null;
  type?: number | null;
  sessionId?: string | null;
  [key: string]: unknown;
}

export type Db90PayloadMetadata = {
  cursor_session_id: string | null;
  workspace: string;
  cost_model: typeof COST_MODEL;
  scannable: false;
  risk_level: "none";
  /** Set when the event comes from Cursor’s `aiCodeTracking.recentCommit` row (one per install, last commit only). */
  source?: "recent_commit";
  commit_hash?: string;
  commit_message?: string;
  repo_name?: string;
  branch_name?: string;
  ai_percentage?: number;
};

export interface Db90Payload extends IngestPayload {
  tool_name: "cursor";
  event_type: "completion" | "chat";
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  occurred_at: string;
  project_id?: string;
  metadata: Db90PayloadMetadata;
}

// Cursor timestamps can be in seconds or milliseconds.
// Numbers below 1e12 are treated as seconds (year ~2001 and beyond).
const EPOCH_SECONDS_THRESHOLD = 1e12;

export function toEpochMs(timestamp: number | string | null | undefined): number | null {
  if (timestamp == null) return null;
  const num = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(num)) return null;
  return num < EPOCH_SECONDS_THRESHOLD ? num * 1000 : num;
}

function toIsoString(timestamp: number | string | null | undefined): string | null {
  const ms = toEpochMs(timestamp);
  if (ms === null) return null;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

// Defensive: callers may receive a PricingConfig from CLI/SDK consumers that
// bypassed the cli.ts validation guard. Clamping at the math layer guarantees
// no negative cost ever lands in an outbound payload.
const nn = (n: number): number => (n > 0 ? n : 0);

// For line-count layout (daily stats v1.5).
// Line counts are clamped to >= 0 alongside pricing rates so a malformed DB
// row can never produce a negative cost_usd in the outbound payload.
function computeLineCost(
  eventType: "completion" | "chat",
  lines: number,
  pricing: PricingConfig
): number {
  const safeLines = Math.max(0, lines);
  const tokensPerLine = nn(pricing.tokens_per_line);
  if (eventType === "completion")
    return (safeLines * tokensPerLine * nn(pricing.completion_output_per_mtok)) / 1_000_000;
  return (safeLines * tokensPerLine * (nn(pricing.chat_output_per_mtok) + nn(pricing.chat_input_per_mtok) * 2)) / 1_000_000;
}

// For token-based events (legacy cursor.db + model-keyed fallback).
// Token counts are clamped to >= 0 so a malformed DB row with negative
// values cannot produce a negative cost_usd in the outbound payload.
function computeTokenCost(
  eventType: "completion" | "chat",
  tokensIn: number,
  tokensOut: number,
  pricing: PricingConfig
): number {
  const safeIn  = Math.max(0, tokensIn);
  const safeOut = Math.max(0, tokensOut);
  if (eventType === "completion")
    return (safeOut * nn(pricing.completion_output_per_mtok)) / 1_000_000;
  return (safeIn * nn(pricing.chat_input_per_mtok) + safeOut * nn(pricing.chat_output_per_mtok)) / 1_000_000;
}

// ─── Daily stats mapping (state.vscdb / ItemTable) ───────────────────────────

import type { DailyStatsEntry, RecentCommitSnapshot } from "./cursor-reader.js";

function pick(obj: unknown, ...keys: string[]): number | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

function buildPayload(opts: {
  eventType: "completion" | "chat";
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  occurredAt: string;
  dbPath: string;
  model?: string;
  projectId?: string;
}): Db90Payload {
  const { eventType, tokensIn, tokensOut, costUsd, occurredAt, dbPath, model = "unknown", projectId } = opts;
  const payload: Db90Payload = {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    occurred_at: occurredAt,
    metadata: { cursor_session_id: null, workspace: dbPath, cost_model: COST_MODEL, scannable: false, risk_level: "none" },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

/**
 * Maps a Cursor dailyStats ItemTable entry to one or more db90 payloads.
 *
 * Cursor tracks line counts, not token counts. We map:
 *   tabSuggestedLines  → tokens_in  (lines offered by tab completion)
 *   tabAcceptedLines   → tokens_out (lines the user kept)
 *   composerSuggestedLines → tokens_in  (lines composed/suggested)
 *   composerAcceptedLines  → tokens_out (lines the user accepted)
 *
 * Older or future Cursor versions may use model-keyed token counts instead;
 * that layout is handled as a fallback.
 */
export function mapDailyStats(
  entry: DailyStatsEntry,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_PRICING
): Db90Payload[] {
  const { date, value, dbPath } = entry;
  const occurredAt = `${date}T00:00:00.000Z`;
  const results: Db90Payload[] = [];

  if (typeof value !== "object" || value === null) return results;

  const obj = value as Record<string, unknown>;

  const tabSuggested      = pick(obj, "tabSuggestedLines") ?? 0;
  const tabAccepted       = pick(obj, "tabAcceptedLines") ?? 0;
  const composerSuggested = pick(obj, "composerSuggestedLines") ?? 0;
  const composerAccepted  = pick(obj, "composerAcceptedLines") ?? 0;

  if (tabSuggested > 0 || tabAccepted > 0)
    results.push(buildPayload({
      eventType: "completion",
      tokensIn: tabSuggested,
      tokensOut: tabAccepted,
      // Cost is driven by suggested (output) lines, not accepted lines —
      // the model incurs cost when generating suggestions regardless of acceptance.
      costUsd: computeLineCost("completion", tabSuggested, pricing),
      occurredAt, dbPath, projectId,
    }));

  if (composerSuggested > 0 || composerAccepted > 0)
    results.push(buildPayload({
      eventType: "chat",
      tokensIn: composerSuggested,
      tokensOut: composerAccepted,
      costUsd: computeLineCost("chat", composerSuggested, pricing),
      occurredAt, dbPath, projectId,
    }));

  if (results.length > 0) return results;

  // Fallback: model-keyed token counts (possible future/other Cursor layouts)
  // e.g. { "claude-3-5-sonnet": { inputTokens: 5000, outputTokens: 1200 } }
  // Keys like "tab", "composer", "date" are Cursor metadata fields, not model names.
  const KNOWN_NON_MODEL_KEYS = new Set(["tab", "composer", "chat", "date", "inputTokens", "outputTokens"]);
  for (const [model, stats] of Object.entries(obj)) {
    if (KNOWN_NON_MODEL_KEYS.has(model) || typeof stats !== "object" || stats === null) continue;
    const tokensIn  = pick(stats, "inputTokens") ?? pick(stats, "promptTokens") ?? 0;
    const tokensOut = pick(stats, "outputTokens") ?? pick(stats, "generatedTokens") ?? 0;
    if (tokensIn === 0 && tokensOut === 0) continue;
    results.push(buildPayload({
      eventType: "chat",
      tokensIn, tokensOut,
      costUsd: computeTokenCost("chat", tokensIn, tokensOut, pricing),
      occurredAt, dbPath, model, projectId,
    }));
  }

  return results;
}

/**
 * Maps Cursor’s latest-commit snapshot (`aiCodeTracking.recentCommit`) to a single chat-style event.
 * Cursor only keeps one recent commit row (overwritten on each new commit).
 */
export function mapRecentCommit(
  entry: RecentCommitSnapshot,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_PRICING
): Db90Payload | null {
  const { value: obj, dbPath } = entry;
  const occurredAt = toIsoString(obj.timestamp as number | string | null | undefined);
  if (!occurredAt) return null;

  const la = Number(obj.linesAdded) || 0;
  const ld = Number(obj.linesDeleted) || 0;
  const tla = Number(obj.tabLinesAdded) || 0;
  const tld = Number(obj.tabLinesDeleted) || 0;
  const cla = Number(obj.composerLinesAdded) || 0;
  const cld = Number(obj.composerLinesDeleted) || 0;
  // Line counts used as token proxies (cost_model = "estimated_line_count").
  // Stored in tokens_in/tokens_out so the schema is uniform, but these are not real token counts.
  const linesAddedProxy = la + tla + cla;
  const linesDeletedProxy = ld + tld + cld;
  if (linesAddedProxy === 0 && linesDeletedProxy === 0) return null;
  const lineForCost = linesAddedProxy + linesDeletedProxy;
  const costUsd = computeLineCost("chat", Math.max(lineForCost, 0), pricing);

  const commitHash = obj.commitHash;
  const commitMessage = obj.commitMessage;
  const repoName = obj.repoName;
  const branchName = obj.branchName;
  const aiPct = obj.aiPercentage;

  const payload: Db90Payload = {
    tool_name: "cursor",
    event_type: "chat",
    model: "unknown",
    tokens_in: linesAddedProxy,
    tokens_out: linesDeletedProxy,
    cost_usd: costUsd,
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: null,
      workspace: dbPath,
      cost_model: COST_MODEL,
      source: "recent_commit",
      commit_hash: typeof commitHash === "string" ? commitHash : undefined,
      commit_message: typeof commitMessage === "string" ? commitMessage : undefined,
      repo_name: typeof repoName === "string" ? repoName : undefined,
      branch_name: typeof branchName === "string" ? branchName : undefined,
      ai_percentage: typeof aiPct === "number" ? aiPct
                   : typeof aiPct === "string" ? parseFloat(aiPct) || undefined
                   : undefined,
      scannable: false,
      risk_level: "none"
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

export function mapEvent(
  row: CursorRow,
  workspacePath: string,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_PRICING
): Db90Payload | null {
  const occurredAt = toIsoString(row.timestamp);
  if (!occurredAt) return null;

  const model = row.model;
  if (!model) return null;

  const eventType: "completion" | "chat" = row.type === 1 ? "chat" : "completion";
  const tokensIn  = row.promptTokens ?? 0;
  const tokensOut = row.generatedTokens ?? 0;

  const payload: Db90Payload = {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: computeTokenCost(eventType, tokensIn, tokensOut, pricing),
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: row.sessionId ?? row.requestId ?? null,
      workspace: workspacePath,
      cost_model: COST_MODEL,
      scannable: false,
      risk_level: "none",
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}
