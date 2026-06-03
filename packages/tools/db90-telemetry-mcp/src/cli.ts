#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { resolveProjectId } from "@db90/sdk";
import { loadCredentials, credentialsHaveAnyToken, pickProjectLookupToken } from "./credentials.js";
import type { TelemetryToolId } from "./credentials.js";
import { loginAndPersistCredentials } from "./auth/flow.js";
import { defaultKeycloakIssuer } from "./auth/keycloak.js";
import { migrateLegacyState, getAppDir } from "./state.js";
import { syncTelemetryTools } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";
import { resolveCursorPricing } from "./cursor-config.js";
import { buildHealthSnapshot, formatHealthForCli } from "./health.js";
import { installClaudeUserMcp, type InstallClaudeUserMcpOptions, type InstallResult } from "./install/claude.js";
import { installHooksConfig, uninstallHooksConfig, verifyHooksConfig, FORWARDER_FILENAME } from "./hooks/hooks-config.js";
import { join } from "node:path";
import { fileURLToPath as nodeFileURLToPath } from "node:url";
import { mcpLog } from "./log.js";

export interface Args {
  command: "init" | "health" | "run" | "help" | "uninstall-hooks" | "verify-hooks";
  help: boolean;
  once: boolean;
  /** With `run --once`: ignore Cursor watermarks and commit hash dedupe. */
  full?: boolean;
  host?: string;
  keycloakUrl?: string;
  toolName?: string;
  /** When set on init, sent as `X-Organization-ID` on MCP exchange (overrides DB90_ORGANIZATION_ID). */
  organizationId?: string;
  force?: boolean;
  /** When set on init, install the Cursor hooks forwarder into ~/.cursor/hooks.json. */
  hooks?: boolean;
}

interface RunOnceDeps {
  loadCredentials: typeof loadCredentials;
  migrateLegacyState: typeof migrateLegacyState;
  getAppDir: typeof getAppDir;
  syncTelemetryTools: typeof syncTelemetryTools;
  resolveProjectId: typeof resolveProjectId;
  pricing: ReturnType<typeof mergePricing>;
  log: (message: string) => void;
  error: (message: string) => void;
}

interface InitDeps {
  loginAndPersistCredentials: typeof loginAndPersistCredentials;
  defaultKeycloakIssuer: typeof defaultKeycloakIssuer;
  getAppDir: typeof getAppDir;
  installClaudeUserMcp: (options: InstallClaudeUserMcpOptions) => InstallResult;
  log: (message: string) => void;
  error: (message: string) => void;
}

const GLOBAL_FLAGS = new Set(["--help", "-h", "--once", "--full"]);
const INIT_VALUE_FLAGS = new Set(["--host", "--keycloak-url", "--tool-name", "--organization-id"]);
const INIT_BOOLEAN_FLAGS = new Set(["--force", "--hooks"]);

/** Matches DB90 Rails `McpController` UUID check for `X-Organization-ID` (RFC 4122 variant). */
export const DB90_ORGANIZATION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDb90OrganizationUuid(value: string): boolean {
  return DB90_ORGANIZATION_UUID_PATTERN.test(value.trim());
}

function takeFlagValue(argv: string[], name: string): string | undefined {
  const eqForm = argv.find((a) => a.startsWith(`${name}=`));
  if (eqForm) {
    return eqForm.slice(name.length + 1);
  }
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const next = argv[idx + 1];
  if (!next || next.startsWith("-")) return undefined;
  return next;
}

function unknownFlags(argv: string[], valueFlags: Set<string>, booleanFlags: Set<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--") && a !== "-h") continue;
    if (GLOBAL_FLAGS.has(a)) continue;

    if (booleanFlags.has(a)) {
      continue;
    }

    if (valueFlags.has(a)) {
      const next = argv[i + 1];
      if (!a.includes("=") && next && !next.startsWith("-")) {
        i += 1;
      }
      continue;
    }
    if (a.startsWith("--") && a.includes("=")) {
      const key = a.slice(0, a.indexOf("="));
      if (booleanFlags.has(key)) {
        out.push(a);
        continue;
      }
      if (valueFlags.has(key)) continue;
    }
    if (a === "-h") continue;
    out.push(a);
  }
  return out;
}

function initExtraPositionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "init") continue;
    if (a === "-h" || GLOBAL_FLAGS.has(a) || INIT_BOOLEAN_FLAGS.has(a)) continue;

    if (INIT_VALUE_FLAGS.has(a)) {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        i += 1;
      }
      continue;
    }

    if (a.startsWith("--")) {
      continue;
    }

    out.push(a);
  }
  return out;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");
  const once = args.includes("--once");
  const full = args.includes("--full");

  const positional = args.filter((a) => !a.startsWith("-") && a !== "-h");
  const raw = positional[0];

  if (raw === "init") {
    const bad = unknownFlags(
      args.filter((a) => a !== "init"),
      INIT_VALUE_FLAGS,
      INIT_BOOLEAN_FLAGS
    );
    if (bad.length > 0) {
      return { command: "help", help: true, once: false };
    }
    if (initExtraPositionals(args).length > 0) {
      return { command: "help", help: true, once: false };
    }
    const host = takeFlagValue(args, "--host");
    const keycloakUrl = takeFlagValue(args, "--keycloak-url");
    const toolName = takeFlagValue(args, "--tool-name");
    const organizationId = takeFlagValue(args, "--organization-id");
    const force = args.includes("--force");
    const hooks = args.includes("--hooks");
    return { command: "init", help, once: false, host, keycloakUrl, toolName, organizationId, force, hooks };
  }

  const nonInitBad = args.filter((a) => {
    if (!a.startsWith("--") && a !== "-h") return false;
    if (GLOBAL_FLAGS.has(a)) return false;
    return true;
  });
  if (nonInitBad.length > 0) {
    return { command: "help", help: true, once: false };
  }

  if (!raw || raw.startsWith("-")) {
    if (raw === "--help" || raw === "-h" || (!raw && help)) {
      return { command: "help", help: true, once: false };
    }
    if (!raw && once) {
      return { command: "run", help, once: true, full: full || undefined };
    }
    if (!raw) {
      return { command: "run", help, once: false, full: full || undefined };
    }
    return { command: "help", help: true, once: false };
  }

  if ((raw === "init" || raw === "health") && (once || full)) {
    return { command: "help", help: true, once: false };
  }

  if (raw === "init" || raw === "health" || raw === "run") {
    return { command: raw, help, once, full: full || undefined };
  }
  if (raw === "serve") {
    return { command: "run", help, once, full: full || undefined };
  }
  if (raw === "uninstall-hooks" || raw === "verify-hooks") {
    return { command: raw, help: false, once: false };
  }

  return { command: "help", help: true, once: false };
}

function printHelp(): void {
  console.log(`
db90-mcp — DB90 MCP telemetry (Claude transcripts + Cursor SQLite ingest)

Usage:
  db90-mcp [command] [options]

Commands:
  run              Start the MCP stdio server (default — used by Claude Code).
  init             Keycloak device login once, then persist DB90 ingest credentials (keychain or file).
  health           Multi-line diagnostic (credentials, sync, log path, state files).
  uninstall-hooks  Remove DB90 from ~/.cursor/hooks.json and restore backup (if any).
  verify-hooks     Print hooks install status and queue depth as JSON.

Options:
  --once      With 'run': perform a multi-tool sync then exit (no MCP server).
  --full      With 'run --once': ignore Cursor watermarks and commit hash dedupe (backfill).
  --help, -h  Show this help message.

init options:
  --host <url>             DB90 API base URL (default: env DB90_API_URL or http://localhost:3000)
  --keycloak-url <issuer>  Keycloak realm issuer (default: env KEYCLOAK_ISSUER / DB90_KEYCLOAK_ISSUER)
  --tool-name <name>       Optional: mint only \`claude_code\`, only \`cursor\`, or omit to mint BOTH.
  --organization-id <uuid> Optional: scope MCP token exchange to this org (overrides env DB90_ORGANIZATION_ID).
  --force                  Replace an existing user "db90" MCP entry in ~/.claude.json if it differs.
  --hooks                  (opt-in) Install Cursor hook forwarder for per-turn model attribution.
                           Requires Cursor restart. Run 'db90-mcp uninstall-hooks' to remove.

Multi-org:
  Set \`DB90_ORGANIZATION_ID\` to a UUID, or pass \`--organization-id\` on \`init\`, so ingest tokens are minted for that membership instead of the default (oldest) org.

Credentials:
  Stored in the OS keychain via keytar when available; otherwise
  ~/.db90-mcp/credentials.json (mode 0600 on POSIX).

Note: Omitting --tool-name provisions separate ingest tokens for Claude Code + Cursor behind a single Keycloak login.
`);
}

function defaultDb90Host(): string {
  const v = process.env["DB90_API_URL"]?.trim();
  if (v) return v.replace(/\/$/, "");
  return "http://localhost:3000";
}

async function runHealth(): Promise<void> {
  const snap = await buildHealthSnapshot();
  console.log(formatHealthForCli(snap));
}

async function runMcpServer(): Promise<void> {
  const { startServer } = await import("./server.js");
  await startServer();
}

export async function runInit(cliArgs: Args, deps?: Partial<InitDeps>): Promise<number> {
  const runtime: InitDeps = {
    loginAndPersistCredentials,
    defaultKeycloakIssuer,
    getAppDir,
    installClaudeUserMcp,
    log: console.log,
    error: console.error,
    ...deps,
  };

  const db90Host = (cliArgs.host ?? defaultDb90Host()).replace(/\/$/, "");
  const kcIssuer = (cliArgs.keycloakUrl ?? runtime.defaultKeycloakIssuer()).trim();
  if (!kcIssuer) {
    runtime.error(
      "Error: Keycloak issuer is not configured. Pass --keycloak-url or set KEYCLOAK_ISSUER / DB90_KEYCLOAK_ISSUER."
    );
    return 1;
  }
  if (cliArgs.toolName !== undefined && !["claude_code", "cursor"].includes(cliArgs.toolName)) {
    runtime.error("Error: --tool-name must be one of: claude_code, cursor.");
    return 1;
  }
  const provisionTools: TelemetryToolId[] =
    cliArgs.toolName === "cursor"
      ? ["cursor"]
      : cliArgs.toolName === "claude_code"
        ? ["claude_code"]
        : ["claude_code", "cursor"];

  const fromFlag = cliArgs.organizationId?.trim();
  const fromEnv = process.env["DB90_ORGANIZATION_ID"]?.trim();
  const exchangeOrganizationId = fromFlag || fromEnv;
  if (exchangeOrganizationId && !isValidDb90OrganizationUuid(exchangeOrganizationId)) {
    runtime.error(
      "Error: --organization-id / DB90_ORGANIZATION_ID must be a valid UUID (RFC 4122, version 1–5, variant per DB90 API)."
    );
    return 1;
  }

  const result = await runtime.loginAndPersistCredentials({
    db90Host,
    keycloakIssuer: kcIssuer,
    tools: provisionTools.length > 1 ? provisionTools : undefined,
    toolName:
      provisionTools.length === 1
        ? provisionTools[0] === "cursor"
          ? "cursor"
          : "claude_code"
        : undefined,
    deviceLabel: "db90-mcp CLI init",
    appDir: runtime.getAppDir(),
    exchangeOrganizationId: exchangeOrganizationId || undefined,
    onVisitInstructions: (uri, code) => {
      runtime.log(`Visit ${uri} and enter code ${code}`);
    },
  });

  if (!result.ok) {
    runtime.error(`Auth failed: ${result.error}`);
    return 1;
  }
  runtime.log(`Credentials saved (organization ${result.organizationId}).`);

  if (cliArgs.hooks) {
    const appDir = runtime.getAppDir();
    const thisFile = nodeFileURLToPath(import.meta.url);
    const pkgRoot = join(thisFile, "..", "..", "..");
    const srcForwarder = join(pkgRoot, "dist", "hooks", FORWARDER_FILENAME);
    try {
      const { forwarderInstalled, backupPath } = installHooksConfig(srcForwarder, appDir);
      runtime.log(`Cursor hooks installed (forwarder: ${forwarderInstalled}).`);
      if (backupPath) {
        runtime.log(`Existing hooks.json backed up to: ${backupPath}`);
      }
      runtime.log("Restart Cursor to activate hook-based model attribution.");
    } catch (err) {
      runtime.error(
        `Warning: --hooks install failed: ${err instanceof Error ? err.message : String(err)}`
      );
      runtime.error(
        `Run 'db90-mcp init --hooks' again after verifying ${srcForwarder} exists.`
      );
    }
  }

  const shouldInstall = provisionTools.includes("claude_code");

  if (shouldInstall) {
    const installResult = runtime.installClaudeUserMcp({ force: cliArgs.force === true });
    switch (installResult.kind) {
      case "already-configured":
        runtime.log("Claude Code MCP: db90 server is already configured for your user.");
        break;
      case "installed":
        runtime.log("Claude Code MCP: added db90 server to your user config (~/.claude.json).");
        break;
      case "requires-force":
        runtime.error(installResult.detail);
        return 1;
      case "error":
        runtime.error(`Claude Code MCP install failed: ${installResult.message}`);
        return 1;
    }

    runtime.log("Restart Claude Code to activate.");
  } else {
    runtime.log("Skipped Claude Code MCP auto-install (--tool-name cursor only).");
  }
  return 0;
}

export async function runOnce(
  deps?: Partial<RunOnceDeps>,
  options?: { fullScan?: boolean }
): Promise<number> {
  const runtime: RunOnceDeps = {
    loadCredentials,
    migrateLegacyState,
    getAppDir,
    syncTelemetryTools,
    resolveProjectId,
    pricing: mergePricing(DEFAULT_PRICING, {}),
    log: console.log,
    error: console.error,
    ...deps,
  };

  const creds = await runtime.loadCredentials();
  if (!creds || !credentialsHaveAnyToken(creds)) {
    mcpLog.warn("credential_validation_failed", { source: "cli_once", reason: "missing_credentials" }, false);
    runtime.error(
      "Error: no DB90 credentials. Run `db90-mcp init` first (dual-tool auth is the default)."
    );
    return 1;
  }
  const appDirRuntime = runtime.getAppDir();
  for (const tok of Object.values(creds.accounts)) {
    if (typeof tok === "string" && tok.length > 0) {
      runtime.migrateLegacyState(appDirRuntime, creds.host, tok);
    }
  }
  const lookupToken = pickProjectLookupToken(creds);
  let projectId: string | null = null;
  let projectIdSource: Awaited<ReturnType<typeof runtime.resolveProjectId>>["source"] = "none";
  if (lookupToken) {
    const resolution = await runtime.resolveProjectId(undefined, undefined, creds.host, lookupToken, false);
    projectId = resolution.projectId;
    projectIdSource = resolution.source;
    mcpLog.info(
      "project_attribution_resolved",
      { project_id: resolution.projectId, source: resolution.source },
      false
    );
  }
  const result = await runtime.syncTelemetryTools({
    credentials: creds,
    dryRun: false,
    verbose: false,
    projectId,
    projectIdSource,
    projectLookupToken: lookupToken,
    pricing: runtime.pricing,
    cursorPricing: resolveCursorPricing(undefined, appDirRuntime),
    appDir: appDirRuntime,
    scopeDir: process.cwd(),
    fullScan: options?.fullScan === true,
  });
  if (result.locked || result.failed > 0) {
    runtime.error(`Sync finished with failures: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
    return 1;
  }
  runtime.log(`Sync complete: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
  return 0;
}

async function runOnceAndExit(fullScan?: boolean): Promise<void> {
  const exitCode = await runOnce(undefined, { fullScan });
  if (exitCode !== 0) process.exit(exitCode);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help || args.command === "help") {
    printHelp();
    return;
  }

  switch (args.command) {
    case "health": {
      await runHealth();
      return;
    }
    case "init": {
      const code = await runInit(args);
      if (code !== 0) process.exit(code);
      return;
    }
    case "uninstall-hooks": {
      const appDir = getAppDir();
      const { restored, backupPath, queueWarning } = uninstallHooksConfig(appDir);
      if (queueWarning) console.warn(`Warning: ${queueWarning}`);
      if (restored) {
        console.log(backupPath ? `Hooks uninstalled; hooks.json restored from ${backupPath}.` : "Hooks uninstalled; hooks.json removed.");
      } else {
        console.log("No DB90 hooks entry found in ~/.cursor/hooks.json — nothing to uninstall.");
      }
      return;
    }
    case "verify-hooks": {
      const report = verifyHooksConfig(getAppDir());
      console.log(JSON.stringify(report, null, 2));
      if (report.next_steps.length > 0) {
        for (const step of report.next_steps) console.log(`Next: ${step}`);
      }
      return;
    }
    case "run":
      if (args.once) {
        await runOnceAndExit(args.full);
        return;
      }
      await runMcpServer();
      return;
  }
}

function isEntryPoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((err) => {
    console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
