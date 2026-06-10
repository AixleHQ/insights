/**
 * Install / uninstall / verify Cursor hooks config for the db90 hook-forwarder.
 * Ported and adapted from @db90/cursor CUR-V13 hooks-feasibility.ts.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const USER_HOOKS_JSON = join(homedir(), ".cursor", "hooks.json");
export const HOOKS_BACKUP_SUFFIX = ".db90-backup";
export const FORWARDER_FILENAME = "hook-forwarder.mjs";
export const REQUIRED_HOOK_FIELDS = ["conversation_id", "model", "workspace_roots"] as const;
export const P0_HOOK_EVENTS = ["sessionEnd", "postToolUse"] as const;

export type RequiredHookField = (typeof REQUIRED_HOOK_FIELDS)[number];

export interface HooksJsonEntry {
  /**
   * Cursor executes this as a single shell command string. Cursor's hooks.json
   * schema does NOT support `args` or `env` — everything (interpreter, script
   * path, flags) must live in `command`. We keep `args`/`env` here only so the
   * parser tolerates legacy/foreign configs; the installer never emits them.
   */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HooksJsonConfig {
  version?: number;
  hooks?: Record<string, Array<HooksJsonEntry>>;
}

export interface HookLogEvent {
  captured_at?: string;
  hook_event_name?: string;
  conversation_id?: string;
  generation_id?: string;
  model?: string;
  workspace_roots?: unknown;
  tool_name?: string;
  duration_ms?: unknown;
  cursor_version?: string;
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
  hooks_json_installed: boolean;
  backup_exists: boolean;
  queue_path_redacted: string;
  queue_depth: number;
  required_fields_verified: boolean;
  sample_events: HookEventAnalysis[];
  next_steps: string[];
}

export function redactHomePath(p: string): string {
  return p.replaceAll(homedir(), "~");
}

export function parseHooksJson(raw: string): HooksJsonConfig | null {
  try {
    return JSON.parse(raw) as HooksJsonConfig;
  } catch {
    return null;
  }
}

export function hooksConfigUsesForwarder(config: HooksJsonConfig, forwarderPath: string): boolean {
  const normalized = resolve(forwarderPath);
  const hooks = config.hooks ?? {};
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      // Current format: forwarder path lives inside the single command string.
      if (typeof entry?.command === "string" && entry.command.includes(FORWARDER_FILENAME)) {
        return true;
      }
      // Legacy format (command + args): tolerated for detection/uninstall.
      if (Array.isArray(entry?.args)) {
        for (const arg of entry.args) {
          if (resolve(arg) === normalized || arg.includes(FORWARDER_FILENAME)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Quote a path for safe inclusion in a POSIX shell command string.
 * Single-quoting suppresses all expansions ($var, `cmd`, $(cmd), glob, history).
 * The only character that cannot appear inside single quotes is a literal single
 * quote, which we escape by ending the quote, adding an escaped quote, then
 * reopening: foo'bar → 'foo'\''bar'
 */
function shellQuote(p: string): string {
  return `'${p.replaceAll("'", "'\\''")}'`;
}

/**
 * Build the single-string `command` Cursor runs for each hook. Cursor's schema
 * has no `args`/`env`, so the interpreter, script path, and appDir flag are all
 * encoded inline. The forwarder reads `--app-dir` to resolve the queue path,
 * since it runs as a Cursor subprocess outside the MCP process.
 */
export function buildForwarderCommand(forwarderPath: string, appDir: string): string {
  return `node ${shellQuote(resolve(forwarderPath))} --app-dir ${shellQuote(appDir)}`;
}

/**
 * Build the hooks.json config that routes P0 events to the forwarder.
 */
export function buildUserHooksConfig(forwarderPath: string, appDir: string): HooksJsonConfig {
  const entry: HooksJsonEntry = {
    command: buildForwarderCommand(forwarderPath, appDir),
  };
  const hooks: Record<string, Array<HooksJsonEntry>> = {};
  for (const event of P0_HOOK_EVENTS) {
    hooks[event] = [entry];
  }
  return { version: 1, hooks };
}

/**
 * Install the db90 hook-forwarder:
 *  1. Copy hook-forwarder.mjs from srcForwarderPath → {appDir}/hook-forwarder.mjs
 *  2. Backup existing ~/.cursor/hooks.json if present
 *  3. Write new hooks.json pointing at the installed forwarder
 */
export function installHooksConfig(srcForwarderPath: string, appDir: string): {
  forwarderInstalled: string;
  backupPath: string | null;
} {
  mkdirSync(appDir, { recursive: true });
  mkdirSync(join(homedir(), ".cursor"), { recursive: true });

  const installedForwarder = join(appDir, FORWARDER_FILENAME);
  copyFileSync(srcForwarderPath, installedForwarder);

  let backupPath: string | null = null;
  if (existsSync(USER_HOOKS_JSON)) {
    const candidate = USER_HOOKS_JSON + HOOKS_BACKUP_SUFFIX;
    if (existsSync(candidate)) {
      // A prior install already captured the user's original — never clobber it.
      backupPath = candidate;
    } else {
      // Only back up if the current config is the user's, not our own install.
      const current = parseHooksJson(readFileSync(USER_HOOKS_JSON, "utf-8"));
      const alreadyOurs =
        current !== null && hooksConfigUsesForwarder(current, installedForwarder);
      if (!alreadyOurs) {
        backupPath = candidate;
        copyFileSync(USER_HOOKS_JSON, candidate);
      }
    }
  }

  const config = buildUserHooksConfig(installedForwarder, appDir);
  const tmp = USER_HOOKS_JSON + ".tmp";
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf-8");
  renameSync(tmp, USER_HOOKS_JSON);

  return { forwarderInstalled: installedForwarder, backupPath };
}

/**
 * Restore the backed-up hooks.json (or remove the current one if no backup existed).
 * Warns (does not throw) if a queue file with unprocessed events exists.
 */
export function uninstallHooksConfig(appDir: string, queuePath?: string): {
  restored: boolean;
  backupPath: string | null;
  queueWarning: string | null;
} {
  const backupPath = USER_HOOKS_JSON + HOOKS_BACKUP_SUFFIX;
  let restored = false;
  let usedBackup: string | null = null;

  if (existsSync(backupPath)) {
    copyFileSync(backupPath, USER_HOOKS_JSON);
    try { unlinkSync(backupPath); } catch { /* non-fatal */ }
    restored = true;
    usedBackup = backupPath;
  } else if (existsSync(USER_HOOKS_JSON)) {
    const current = parseHooksJson(readFileSync(USER_HOOKS_JSON, "utf-8"));
    const installedForwarder = join(appDir, FORWARDER_FILENAME);
    if (current && hooksConfigUsesForwarder(current, installedForwarder)) {
      try { unlinkSync(USER_HOOKS_JSON); } catch { /* non-fatal */ }
      restored = true;
    }
  }

  const resolvedQueue = queuePath ?? join(appDir, "hooks-queue.ndjson");
  let queueWarning: string | null = null;
  if (existsSync(resolvedQueue)) {
    const lines = readHooksQueue(resolvedQueue);
    if (lines.length > 0) {
      queueWarning = `hooks-queue.ndjson has ${lines.length} unprocessed event(s) — run db90-mcp run --once before uninstalling to flush them`;
    }
  }

  return { restored, backupPath: usedBackup, queueWarning };
}

export function readHooksQueue(queuePath: string): HookLogEvent[] {
  if (!existsSync(queuePath)) return [];
  const raw = readFileSync(queuePath, "utf-8");
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
    const present = value !== undefined;
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
    hook_event_name: typeof event.hook_event_name === "string" ? event.hook_event_name : null,
    field_checks,
    passes_required_fields: field_checks.every((c) => c.populated),
  };
}

export function verifyHooksConfig(appDir: string): HookFeasibilityReport {
  const installedForwarder = join(appDir, FORWARDER_FILENAME);
  const queuePath = join(appDir, "hooks-queue.ndjson");

  let hooks_json_installed = false;
  if (existsSync(USER_HOOKS_JSON)) {
    const config = parseHooksJson(readFileSync(USER_HOOKS_JSON, "utf-8"));
    hooks_json_installed = config !== null && hooksConfigUsesForwarder(config, installedForwarder);
  }

  const events = readHooksQueue(queuePath);
  const analyzed = events.map(analyzeHookEvent);
  const passing = analyzed.filter((a) => a.passes_required_fields);
  const required_fields_verified = passing.length > 0;
  const sample_events = passing.slice(-3);
  if (sample_events.length === 0 && analyzed.length > 0) {
    sample_events.push(...analyzed.slice(-2));
  }

  const next_steps: string[] = [];
  if (!hooks_json_installed) {
    next_steps.push("Run: db90-mcp init --hooks");
  } else if (events.length === 0) {
    next_steps.push("Restart Cursor, then run an Agent session to emit hook events.");
    next_steps.push("Re-run: db90-mcp verify-hooks");
  }

  return {
    captured_at: new Date().toISOString(),
    platform: process.platform,
    hooks_json_installed,
    backup_exists: existsSync(USER_HOOKS_JSON + HOOKS_BACKUP_SUFFIX),
    queue_path_redacted: redactHomePath(queuePath),
    queue_depth: events.length,
    required_fields_verified,
    sample_events,
    next_steps,
  };
}
