import type { Db90Payload } from "./mapper.js";

/** Ingest paths exercised by db90-cursor (see DATA-CURSOR.md §3.5). */
export type CursorIngestPath = "daily_tab" | "daily_composer" | "legacy_request" | "recent_commit";

export interface PayloadValidationResult {
  ok: boolean;
  errors: string[];
  path: CursorIngestPath | "unknown";
}

const TOP_LEVEL_KEYS = new Set([
  "tool_name",
  "event_type",
  "model",
  "tokens_in",
  "tokens_out",
  "cost_usd",
  "occurred_at",
  "project_id",
  "metadata",
]);

const METADATA_BASE_KEYS = new Set([
  "cursor_session_id",
  "workspace",
  "workspace_scope",
  "workspace_folder",
  "cost_model",
  "scannable",
  "risk_level",
]);

const METADATA_COMMIT_KEYS = new Set([
  ...METADATA_BASE_KEYS,
  "source",
  "commit_hash",
  "commit_message",
  "repo_name",
  "branch_name",
  "ai_percentage",
]);

const EVENT_TYPES = new Set(["completion", "chat", "commit"]);

export function inferIngestPath(payload: Db90Payload): CursorIngestPath | "unknown" {
  if (payload.event_type === "commit" || payload.metadata.source === "recent_commit") {
    return "recent_commit";
  }
  if (payload.metadata.cursor_session_id !== null) {
    return "legacy_request";
  }
  if (payload.event_type === "completion") return "daily_tab";
  if (payload.event_type === "chat") return "daily_composer";
  return "unknown";
}

function unexpectedKeys(obj: Record<string, unknown>, allowed: Set<string>, label: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errors.push(`${label}: unexpected key "${key}"`);
  }
  return errors;
}

function isNonNegativeNumber(value: unknown, field: string): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return `${field} must be a non-negative number`;
  }
  return null;
}

export function validateCursorPayload(payload: Db90Payload): PayloadValidationResult {
  const errors: string[] = [];
  const path = inferIngestPath(payload);

  errors.push(...unexpectedKeys(payload as unknown as Record<string, unknown>, TOP_LEVEL_KEYS, "payload"));

  if (payload.tool_name !== "cursor") errors.push('tool_name must be "cursor"');
  if (!EVENT_TYPES.has(payload.event_type)) errors.push(`event_type must be one of ${[...EVENT_TYPES].join(", ")}`);

  if (typeof payload.model !== "string" || payload.model.length === 0) {
    errors.push("model must be a non-empty string");
  }

  for (const field of ["tokens_in", "tokens_out", "cost_usd"] as const) {
    const err = isNonNegativeNumber(payload[field], field);
    if (err) errors.push(err);
  }

  if (typeof payload.occurred_at !== "string" || Number.isNaN(Date.parse(payload.occurred_at))) {
    errors.push("occurred_at must be a valid ISO-8601 string");
  }

  if (payload.project_id !== undefined && typeof payload.project_id !== "string") {
    errors.push("project_id must be a string when present");
  }

  const meta = payload.metadata;
  if (typeof meta !== "object" || meta === null) {
    errors.push("metadata must be an object");
  } else {
    const allowedMeta = path === "recent_commit" ? METADATA_COMMIT_KEYS : METADATA_BASE_KEYS;
    errors.push(
      ...unexpectedKeys(meta as unknown as Record<string, unknown>, allowedMeta, "metadata")
    );

    if (meta.cursor_session_id !== null && typeof meta.cursor_session_id !== "string") {
      errors.push("metadata.cursor_session_id must be string or null");
    }
    if (typeof meta.workspace !== "string" || meta.workspace.length === 0) {
      errors.push("metadata.workspace must be a non-empty string");
    }
    if (meta.workspace_scope !== "global" && meta.workspace_scope !== "workspace") {
      errors.push('metadata.workspace_scope must be "global" or "workspace"');
    }
    if (meta.workspace_folder !== undefined && typeof meta.workspace_folder !== "string") {
      errors.push("metadata.workspace_folder must be a string when present");
    }
    if (meta.workspace_scope === "global" && meta.workspace_folder !== undefined) {
      errors.push("metadata.workspace_folder must be omitted when workspace_scope is global");
    }
    if (path === "legacy_request") {
      if (meta.cost_model !== "token_count") {
        errors.push('metadata.cost_model must be "token_count" for legacy cursor.db ingest');
      }
    } else if (meta.cost_model !== "estimated_line_count") {
      errors.push('metadata.cost_model must be "estimated_line_count" for line-based cursor ingest');
    }
    if (meta.scannable !== false) errors.push("metadata.scannable must be false");
    if (meta.risk_level !== "none") errors.push('metadata.risk_level must be "none"');

    if (path === "recent_commit") {
      if (meta.source !== "recent_commit") {
        errors.push('metadata.source must be "recent_commit" for commit path');
      }
      if (payload.event_type !== "commit") {
        errors.push('event_type must be "commit" when metadata.source is recent_commit');
      }
    }
  }

  return { ok: errors.length === 0, errors, path };
}

export interface DryRunMatrixRow {
  path: CursorIngestPath | "unknown";
  count: number;
  sample_occurred_at: string | null;
}

export function summarizeDryRunMatrix(payloads: Db90Payload[]): DryRunMatrixRow[] {
  const byPath = new Map<CursorIngestPath | "unknown", Db90Payload[]>();
  for (const p of payloads) {
    const path = inferIngestPath(p);
    const list = byPath.get(path) ?? [];
    list.push(p);
    byPath.set(path, list);
  }

  const order: Array<CursorIngestPath | "unknown"> = [
    "daily_tab",
    "daily_composer",
    "legacy_request",
    "recent_commit",
    "unknown",
  ];

  return order
    .filter((path) => (byPath.get(path)?.length ?? 0) > 0)
    .map((path) => {
      const list = byPath.get(path)!;
      return {
        path,
        count: list.length,
        sample_occurred_at: list[0]?.occurred_at ?? null,
      };
    });
}
