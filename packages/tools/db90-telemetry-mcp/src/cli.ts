#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { loadCredentials } from "./credentials.js";
import { loginAndPersistCredentials } from "./auth/flow.js";
import { defaultKeycloakIssuer } from "./auth/keycloak.js";
import { migrateLegacyState, getAppDir } from "./state.js";
import { syncOnce } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";

export interface Args {
  command: "init" | "health" | "run" | "help";
  help: boolean;
  once: boolean;
  host?: string;
  keycloakUrl?: string;
  toolName?: string;
}

interface RunOnceDeps {
  loadCredentials: typeof loadCredentials;
  migrateLegacyState: typeof migrateLegacyState;
  getAppDir: typeof getAppDir;
  syncOnce: typeof syncOnce;
  pricing: ReturnType<typeof mergePricing>;
  log: (message: string) => void;
  error: (message: string) => void;
}

interface InitDeps {
  loginAndPersistCredentials: typeof loginAndPersistCredentials;
  defaultKeycloakIssuer: typeof defaultKeycloakIssuer;
  getAppDir: typeof getAppDir;
  log: (message: string) => void;
  error: (message: string) => void;
}

const GLOBAL_FLAGS = new Set(["--help", "-h", "--once"]);

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

function unknownFlags(argv: string[], allowed: Set<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--") && a !== "-h") continue;
    if (GLOBAL_FLAGS.has(a)) continue;
    if (allowed.has(a)) {
      const next = argv[i + 1];
      if (!a.includes("=") && next && !next.startsWith("-")) {
        i += 1;
      }
      continue;
    }
    if (a.startsWith("--") && a.includes("=")) {
      const key = a.slice(0, a.indexOf("="));
      if (allowed.has(key)) continue;
    }
    if (a === "-h") continue;
    out.push(a);
  }
  return out;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");
  const once = args.includes("--once");

  const positional = args.filter((a) => !a.startsWith("-") && a !== "-h");
  const raw = positional[0];

  const initAllowed = new Set(["--host", "--keycloak-url", "--tool-name"]);

  if (raw === "init") {
    const bad = unknownFlags(
      args.filter((a) => a !== "init"),
      initAllowed
    );
    if (bad.length > 0) {
      return { command: "help", help: true, once: false };
    }
    const host = takeFlagValue(args, "--host");
    const keycloakUrl = takeFlagValue(args, "--keycloak-url");
    const toolName = takeFlagValue(args, "--tool-name");
    return { command: "init", help, once: false, host, keycloakUrl, toolName };
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
      return { command: "run", help, once: true };
    }
    if (!raw) {
      return { command: "run", help, once: false };
    }
    return { command: "help", help: true, once: false };
  }

  if ((raw === "init" || raw === "health") && once) {
    return { command: "help", help: true, once: false };
  }

  if (raw === "init" || raw === "health" || raw === "run") {
    return { command: raw, help, once };
  }
  if (raw === "serve") {
    return { command: "run", help, once };
  }

  return { command: "help", help: true, once: false };
}

function printHelp(): void {
  console.log(`
db90-mcp — DB90 MCP server (Claude transcript sync)

Usage:
  db90-mcp [command] [options]

Commands:
  run         Start the MCP stdio server (default — used by Claude Code).
  init        Keycloak device login, then save DB90 ingest credentials (keychain or file).
  health      Minimal process diagnostic.

Options:
  --once      With 'run': perform a single sync and exit (no MCP server).
  --help, -h  Show this help message.

init options:
  --host <url>            DB90 API base URL (default: env DB90_API_URL or http://localhost:3000)
  --keycloak-url <issuer> Keycloak realm issuer (default: env KEYCLOAK_ISSUER / DB90_KEYCLOAK_ISSUER; local default only with DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=true)
  --tool-name <name>      claude_code or cursor (default: claude_code)

Credentials:
  Stored in the OS keychain via keytar when available; otherwise
  ~/.db90-mcp/credentials.json (mode 0600 on POSIX).
`);
}

function defaultDb90Host(): string {
  const v = process.env["DB90_API_URL"]?.trim();
  if (v) return v.replace(/\/$/, "");
  return "http://localhost:3000";
}

function runHealth(): void {
  console.log("db90-mcp: ok (stdio MCP + Claude transcript sync when configured)");
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
  const tool = cliArgs.toolName ?? "claude_code";
  if (!["claude_code", "cursor"].includes(tool)) {
    runtime.error("Error: --tool-name must be one of: claude_code, cursor.");
    return 1;
  }

  const result = await runtime.loginAndPersistCredentials({
    db90Host,
    keycloakIssuer: kcIssuer,
    toolName: tool,
    deviceLabel: "db90-mcp CLI init",
    appDir: runtime.getAppDir(),
    onVisitInstructions: (uri, code) => {
      runtime.log(`Visit ${uri} and enter code ${code}`);
    },
  });

  if (!result.ok) {
    runtime.error(`Auth failed: ${result.error}`);
    return 1;
  }
  runtime.log(
    `Credentials saved (organization ${result.organizationId}). You can run \`db90-mcp run\` or \`db90-mcp run --once\`.`
  );
  return 0;
}

export async function runOnce(deps?: Partial<RunOnceDeps>): Promise<number> {
  const runtime: RunOnceDeps = {
    loadCredentials,
    migrateLegacyState,
    getAppDir,
    syncOnce,
    pricing: mergePricing(DEFAULT_PRICING, {}),
    log: console.log,
    error: console.error,
    ...deps,
  };

  const creds = await runtime.loadCredentials();
  if (!creds) {
    runtime.error(
      'Error: no DB90 credentials. Run `db90-mcp init` or create ~/.db90-mcp/credentials.json with "token" and "host".'
    );
    return 1;
  }
  runtime.migrateLegacyState(runtime.getAppDir(), creds.host, creds.token);
  const result = await runtime.syncOnce({
    token: creds.token,
    host: creds.host,
    dryRun: false,
    verbose: false,
    projectId: null,
    pricing: runtime.pricing,
  });
  if (result.locked || result.failed > 0) {
    runtime.error(`Sync finished with failures: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
    return 1;
  }
  runtime.log(`Sync complete: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
  return 0;
}

async function runOnceAndExit(): Promise<void> {
  const exitCode = await runOnce();
  if (exitCode !== 0) process.exit(exitCode);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help || args.command === "help") {
    printHelp();
    return;
  }

  switch (args.command) {
    case "health":
      runHealth();
      return;
    case "init": {
      const code = await runInit(args);
      if (code !== 0) process.exit(code);
      return;
    }
    case "run":
      if (args.once) {
        await runOnceAndExit();
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
