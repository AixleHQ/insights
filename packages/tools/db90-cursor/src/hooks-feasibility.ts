/**
 * CUR-V13 — audit Cursor hooks config + captured hook log (read-only).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_HOOK_LOG_PATH = join(homedir(), ".cursor", "db90-hooks-feasibility.ndjson");
export const USER_HOOKS_JSON = join(homedir(), ".cursor", "hooks.json");
export const LOGGER_SCRIPT_NAME = "log-hook-event.mjs";

export const REQUIRED_HOOK_FIELDS = [
  "conversation_id",
  "model",
  "workspace_roots",
] as const;

export type RequiredHookField = (typeof REQUIRED_HOOK_FIELDS)[number];

export interface HooksJsonConfig {
  version?: number;
  hooks?: Record<string, Array<{ command?: string }>>;
}

export interface HookLogEvent {
  captured_at?: string;
  hook_event_name?: string;
  conversation_id?: string;
  model?: string;
  workspace_roots?: unknown;
  [key: string]: unknown;
}

export interface HookEventFieldCheck {
  field: RequiredHookField;
  present: boolean;
  populated: boolean;
  note?: string;
}

export interface HookEventAnalysis {
  captured_at: string | null;
  hook_event_name: string | null;
  field_checks: HookEventFieldCheck[];
  passes_required_fields: boolean;
}

export interface HookFeasibilityReport {
  captured_at: string;
  platform: NodeJS.Platform;
  hooks_json_paths: Array<{ path_redacted: string; exists: boolean; has_db90_logger: boolean }>;
  log_path_redacted: string;
  log_exists: boolean;
  log_line_count: number;
  events_analyzed: number;
  session_end_events: number;
  post_tool_use_events: number;
  /** At least one event with conversation_id + model + workspace_roots. */
  required_fields_verified: boolean;
  sample_events: HookEventAnalysis[];
  ingest_scope_note: string;
  next_steps: string[];
}

export function redactHomePath(p: string): string {
  return p.replaceAll(homedir(), "~");
}

export function defaultLoggerScriptPath(packageRoot: string): string {
  return join(packageRoot, "hooks-feasibility", LOGGER_SCRIPT_NAME);
}

export function parseHooksJson(raw: string): HooksJsonConfig | null {
  try {
    return JSON.parse(raw) as HooksJsonConfig;
  } catch {
    return null;
  }
}

export function hooksConfigUsesLogger(
  config: HooksJsonConfig,
  loggerPath: string
): boolean {
  const normalizedLogger = resolve(loggerPath);
  const hooks = config.hooks ?? {};
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.command) continue;
      if (resolve(entry.command) === normalizedLogger) return true;
      if (entry.command.includes(LOGGER_SCRIPT_NAME)) return true;
    }
  }
  return false;
}

export function buildUserHooksConfig(loggerPath: string): HooksJsonConfig {
  const command = resolve(loggerPath);
  const entry = { command };
  return {
    version: 1,
    hooks: {
      sessionEnd: [entry],
      postToolUse: [entry],
    },
  };
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function workspaceRootsPopulated(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.some((r) => isNonEmptyString(r));
}

export function analyzeHookEvent(event: HookLogEvent): HookEventAnalysis {
  const field_checks: HookEventFieldCheck[] = REQUIRED_HOOK_FIELDS.map((field) => {
    const value = event[field];
    let present = value !== undefined;
    let populated = false;
    let note: string | undefined;

    if (field === "workspace_roots") {
      populated = workspaceRootsPopulated(value);
      if (present && !populated) note = "empty or non-string array";
    } else {
      populated = isNonEmptyString(value);
      if (present && !populated) note = "empty string";
    }

    return { field, present, populated, note };
  });

  return {
    captured_at: typeof event.captured_at === "string" ? event.captured_at : null,
    hook_event_name:
      typeof event.hook_event_name === "string" ? event.hook_event_name : null,
    field_checks,
    passes_required_fields: field_checks.every((c) => c.populated),
  };
}

export function readHookLogEvents(logPath: string): HookLogEvent[] {
  if (!existsSync(logPath)) return [];
  const raw = readFileSync(logPath, "utf-8");
  const events: HookLogEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as HookLogEvent);
    } catch {
      events.push({ hook_event_name: "log_parse_error" });
    }
  }
  return events;
}

export function analyzeHookFeasibility(options: {
  logPath?: string;
  loggerPath: string;
  projectHooksPath?: string;
}): HookFeasibilityReport {
  const logPath = options.logPath ?? DEFAULT_HOOK_LOG_PATH;
  const loggerPath = resolve(options.loggerPath);

  const hooks_json_paths: HookFeasibilityReport["hooks_json_paths"] = [];
  for (const path of [USER_HOOKS_JSON, options.projectHooksPath].filter(Boolean) as string[]) {
    const exists = existsSync(path);
    let has_db90_logger = false;
    if (exists) {
      const config = parseHooksJson(readFileSync(path, "utf-8"));
      has_db90_logger = config !== null && hooksConfigUsesLogger(config, loggerPath);
    }
    hooks_json_paths.push({
      path_redacted: redactHomePath(path),
      exists,
      has_db90_logger,
    });
  }

  const events = readHookLogEvents(logPath);
  const session_end_events = events.filter((e) => e.hook_event_name === "sessionEnd").length;
  const post_tool_use_events = events.filter((e) => e.hook_event_name === "postToolUse").length;

  const analyzed = events.map(analyzeHookEvent);
  const passing = analyzed.filter((a) => a.passes_required_fields);
  const required_fields_verified = passing.length > 0;

  const sample_events = passing.slice(-3);
  if (sample_events.length === 0 && analyzed.length > 0) {
    sample_events.push(...analyzed.slice(-2));
  }

  const configInstalled = hooks_json_paths.some((p) => p.has_db90_logger);

  const next_steps: string[] = [];
  if (!configInstalled) {
    next_steps.push("Run: npm run install:hooks-feasibility");
  }
  if (!existsSync(logPath) || events.length === 0) {
    next_steps.push(
      "Use Cursor Agent/Composer (Auto mode OK) — run a tool or end a session to emit hooks."
    );
    next_steps.push("Re-run: npm run verify:hooks-feasibility");
  }

  let ingest_scope_note: string;
  if (required_fields_verified) {
    ingest_scope_note =
      "Hooks deliver conversation_id, model, and workspace_roots on this install. " +
      "Hook-driven ingest is out of scope for AIX-235 (exploratory only); a future spike may POST to db90.";
  } else if (configInstalled && events.length > 0) {
    ingest_scope_note =
      "Hook log has events but required fields are missing or empty — check Cursor version or hook payload drift.";
  } else if (configInstalled) {
    ingest_scope_note =
      "Hooks configured; waiting for Cursor sessions to populate the log (no DB90 POST in this verification).";
  } else {
    ingest_scope_note =
      "Hooks not configured on this machine. Install the feasibility logger to validate Auto-mode model attribution.";
  }

  return {
    captured_at: new Date().toISOString(),
    platform: process.platform,
    hooks_json_paths,
    log_path_redacted: redactHomePath(logPath),
    log_exists: existsSync(logPath),
    log_line_count: events.length,
    events_analyzed: events.length,
    session_end_events,
    post_tool_use_events,
    required_fields_verified,
    sample_events,
    ingest_scope_note,
    next_steps,
  };
}
