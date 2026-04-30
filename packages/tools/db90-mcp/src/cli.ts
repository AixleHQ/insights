#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getAuthStatus, authenticate } from "./auth.js";
import { loadState } from "./state.js";
import { recentErrors } from "./log.js";
import { ensureConfigFile } from "./config.js";

export interface Args {
  command: "init" | "health" | "serve" | "help";
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const command = args[0] ?? "serve";
  const help = args.includes("--help") || args.includes("-h");
  if (command === "init" || command === "health" || command === "serve") {
    return { command, help };
  }
  if (command === "--help" || command === "-h") {
    return { command: "help", help: true };
  }
  return { command: "help", help: true };
}

function printHelp(): void {
  console.log(`
db90-mcp — MCP server that auto-forwards Claude Code and Cursor usage to db90

Usage:
  db90-mcp [command] [options]

Commands:
  serve       Start the MCP stdio server (default — invoked by Claude Code / Cursor).
  init        Register this MCP entry in your Claude Code / Cursor config.
  health      Print authentication, last-sync, and recent error summary.

Options:
  --help, -h  Show this help message.

State directory: ~/.db90-mcp/
Log file:        ~/.db90-mcp/mcp.log
`);
}

function ageHumanReadable(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

async function runHealth(): Promise<number> {
  const auth = await getAuthStatus();
  const state = loadState();
  const errors = recentErrors();
  const lastError = errors.length > 0 ? errors[errors.length - 1] : null;

  console.log(`host:           ${auth.host ?? "(not set)"}`);
  console.log(`authenticated:  ${auth.authenticated ? "yes" : "no"}`);
  console.log(
    `last sync:      ${state.lastSyncAt ?? "never"}${state.lastSyncAt ? ` (${ageHumanReadable(state.lastSyncAt)})` : ""}`
  );
  console.log(`errors (count): ${state.errorsCount}`);
  console.log(
    `errors (last):  ${lastError ? `${lastError.message} (${ageHumanReadable(lastError.at)})` : "none"}`
  );
  console.log(`log:            ~/.db90-mcp/mcp.log`);

  return auth.authenticated && state.errorsCount === 0 ? 0 : 1;
}

interface ClaudeJsonConfig {
  mcpServers?: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
  [key: string]: unknown;
}

function claudeConfigPath(): string {
  return join(homedir(), ".claude.json");
}

function loadClaudeConfig(path: string): ClaudeJsonConfig {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ClaudeJsonConfig;
  } catch {
    return {};
  }
}

function writeClaudeConfig(path: string, config: ClaudeJsonConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2), { encoding: "utf8" });
}

async function runInit(): Promise<number> {
  // Materialise the MCP-side config file with sane defaults (host,
  // keycloakIssuer, defaultToolName) so the user can edit it before login.
  ensureConfigFile();

  // Add the MCP entry to Claude Code's user config (~/.claude.json) so
  // the editor spawns this server on next launch. We use `npx` so the
  // entry stays valid even if the binary's absolute path moves.
  const path = claudeConfigPath();
  const config = loadClaudeConfig(path);
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers["db90"] = {
    command: "npx",
    args: [ "-y", "@db90/mcp", "serve" ],
  };
  writeClaudeConfig(path, config);
  console.log(`✓ Wrote MCP entry to ${path}`);

  // Run the device flow if the user isn't authenticated yet.
  const auth = await getAuthStatus();
  if (auth.authenticated) {
    console.log("✓ Already authenticated; restart Claude Code to activate db90-mcp.");
    return 0;
  }

  console.log("✓ Starting login flow...");
  try {
    await authenticate({
      onPrompt: (p) => {
        const url = p.verificationUriComplete ?? p.verificationUri;
        console.log(`  Visit: ${url}`);
        console.log(`  Code:  ${p.userCode}`);
      },
    });
    console.log("✓ Login complete. Restart Claude Code to activate db90-mcp.");
    return 0;
  } catch (err) {
    console.error("✗ Login failed:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function runServe(): Promise<void> {
  const { startServer } = await import("./server.js");
  await startServer();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help || args.command === "help") {
    printHelp();
    return;
  }

  switch (args.command) {
    case "health": {
      const code = await runHealth();
      if (code !== 0) process.exit(code);
      return;
    }
    case "init": {
      const code = await runInit();
      if (code !== 0) process.exit(code);
      return;
    }
    case "serve":
      await runServe();
      return;
  }
}

// Resolve both paths with realpathSync: npm's bin installer creates a
// symlink at node_modules/.bin/db90-mcp that would otherwise fail the
// naive argv[1] === import.meta.url comparison, preventing main() from
// running when users invoke `db90-mcp` or `npx @db90/mcp`.
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
