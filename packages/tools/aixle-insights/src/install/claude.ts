import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * User-scope Claude Code MCP servers live in ~/.claude.json under top-level `mcpServers`
 * (see Anthropic Claude Code MCP docs: user scope → ~/.claude.json; project scope → .mcp.json).
 */
export type InstallResult =
  | { kind: "already-configured" }
  | { kind: "installed" }
  | { kind: "requires-force"; detail: string }
  | { kind: "error"; message: string };

export interface InstallClaudeUserMcpOptions {
  /** Tests: full path to the Claude user config file (default ~/.claude.json). */
  claudeConfigPath?: string;
  force?: boolean;
}

export function defaultClaudeUserConfigPath(): string {
  const override = process.env["DB90_CLAUDE_USER_CONFIG_PATH"]?.trim();
  if (override) return override;
  return join(homedir(), ".claude.json");
}

/** Exposed for tests; `platform` defaults to `process.platform`. */
export function desiredAixleInsightsEntry(platform: NodeJS.Platform = process.platform): {
  command: string;
  args: string[];
} {
  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "npx", "-y", "@aixle/insights", "run"],
    };
  }
  return {
    command: "npx",
    args: ["-y", "@aixle/insights", "run"],
  };
}

function readRootObject(path: string): InstallResult | Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, "utf-8");
    if (!raw.trim()) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        kind: "error",
        message: `${path}: top-level JSON value must be an object.`,
      };
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "error", message: `Cannot read ${path}: ${msg}` };
  }
}

function normalizeCommandEntry(e: unknown): { command: string; args: string[] } | null {
  if (typeof e !== "object" || e === null) return null;
  const o = e as Record<string, unknown>;
  if (typeof o.command !== "string") return null;
  if (!Array.isArray(o.args) || !o.args.every((x) => typeof x === "string")) return null;
  return { command: o.command, args: [...o.args] };
}

export function aixleInsightsEntryMatchesDesired(existing: unknown, desired: { command: string; args: string[] }): boolean {
  const norm = normalizeCommandEntry(existing);
  if (!norm) return false;
  if (norm.command !== desired.command || norm.args.length !== desired.args.length) return false;
  return norm.args.every((a, i) => a === desired.args[i]);
}

function atomicWriteJson(path: string, data: Record<string, unknown>): InstallResult {
  try {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    const tmpPath = join(dir, `.aixle-insights-claude-json-${randomBytes(8).toString("hex")}.tmp`);
    writeFileSync(tmpPath, serialized, "utf-8");
    renameSync(tmpPath, path);
    return { kind: "installed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "error", message: `Failed to write ${path}: ${msg}` };
  }
}

const LEGACY_MCP_KEY = "db90";
const AIXLE_INSIGHTS_MCP_KEY = "aixle-insights";

/**
 * Merges top-level `mcpServers.aixle-insights` into ~/.claude.json (or overridden path).
 * Preserves all other keys and MCP server entries. If a legacy `mcpServers.db90`
 * entry from a prior install is present, removes it so Claude Code does not
 * spawn both old and new MCP servers (delete-old-key shim).
 */
export function installClaudeUserMcp(options: InstallClaudeUserMcpOptions = {}): InstallResult {
  const path = options.claudeConfigPath ?? defaultClaudeUserConfigPath();
  const force = options.force === true;
  const desired = desiredAixleInsightsEntry();

  const rootRead = readRootObject(path);
  if ("kind" in rootRead && typeof rootRead.kind === "string" && rootRead.kind === "error") {
    return rootRead as InstallResult;
  }

  const root = {
    ...(rootRead as Record<string, unknown>),
  };

  const rawServers = root["mcpServers"];
  let mcpServers: Record<string, unknown>;
  if (rawServers === undefined) {
    mcpServers = {};
  } else if (
    typeof rawServers === "object" &&
    rawServers !== null &&
    !Array.isArray(rawServers)
  ) {
    mcpServers = { ...(rawServers as Record<string, unknown>) };
  } else {
    return {
      kind: "error",
      message: `Invalid Claude config at ${path}: "mcpServers" must be an object when present.`,
    };
  }

  const existing = mcpServers[AIXLE_INSIGHTS_MCP_KEY];
  if (existing !== undefined) {
    if (aixleInsightsEntryMatchesDesired(existing, desired)) {
      // Even if the new entry matches, clean up the legacy "db90" key if it
      // somehow still exists (defensive — handles users who manually copied
      // both keys, or partial-state from earlier installs).
      if (mcpServers[LEGACY_MCP_KEY] !== undefined) {
        delete mcpServers[LEGACY_MCP_KEY];
        root["mcpServers"] = mcpServers;
        return atomicWriteJson(path, root);
      }
      return { kind: "already-configured" };
    }
    if (!force) {
      return {
        kind: "requires-force",
        detail:
          'A different "aixle-insights" MCP server entry already exists in the Claude Code user config (~/.claude.json). Re-run with `init --force` to replace only that entry.',
      };
    }
  }

  // Delete-old-key shim: an existing "db90" entry from a prior install must
  // go before we write the new "aixle-insights" entry. Otherwise Claude Code
  // would spawn BOTH MCP servers and we would get duplicate ingestion.
  if (mcpServers[LEGACY_MCP_KEY] !== undefined) {
    delete mcpServers[LEGACY_MCP_KEY];
  }

  mcpServers[AIXLE_INSIGHTS_MCP_KEY] = { command: desired.command, args: desired.args };
  root["mcpServers"] = mcpServers;

  return atomicWriteJson(path, root);
}
