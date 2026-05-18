#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { loadCredentials } from "./credentials.js";
import { migrateLegacyState, getAppDir } from "./state.js";
import { syncOnce } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";

export interface Args {
  command: "init" | "health" | "run" | "help";
  help: boolean;
  once: boolean;
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

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");
  const once = args.includes("--once");
  const validOptions = new Set(["--help", "-h", "--once"]);

  const positional = args.filter((a) => !a.startsWith("-"));
  const raw = positional[0];

  if (args.some((a) => a.startsWith("-") && !validOptions.has(a))) {
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
  init        Print the ~/.claude.json MCP snippet (no auth, no file writes).
  health      Minimal process diagnostic.

Options:
  --once      With \`run\`: perform a single sync and exit (no MCP server).
  --help, -h  Show this help message.

Credentials (manual, this phase):
  ~/.db90-mcp/credentials.json
  { "token": "db90_...", "host": "http://localhost:3000" }
`);
}

function printInitSnippet(): void {
  console.log(`Add an entry under "mcpServers" in ~/.claude.json, then restart Claude Code.

Example (global install):

  "db90": {
    "command": "db90-mcp",
    "args": ["run"]
  }

Example (npx, no global install):

  "db90": {
    "command": "npx",
    "args": ["-y", "@db90/mcp", "run"]
  }

Create ~/.db90-mcp/credentials.json with your ingest token and DB90 host URL.
`);
}

function runHealth(): void {
  console.log("db90-mcp: ok (stdio MCP + Claude transcript sync when configured)");
}

async function runMcpServer(): Promise<void> {
  const { startServer } = await import("./server.js");
  await startServer();
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

  const creds = runtime.loadCredentials();
  if (!creds) {
    runtime.error(
      "Error: missing ~/.db90-mcp/credentials.json with \"token\" and \"host\" (see README)."
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
    case "init":
      printInitSnippet();
      return;
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
