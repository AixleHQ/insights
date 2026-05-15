#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export interface Args {
  command: "init" | "health" | "run" | "help";
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const raw = args[0];
  const help = args.includes("--help") || args.includes("-h");

  if (!raw || raw.startsWith("-")) {
    if (raw === "--help" || raw === "-h" || (!raw && help)) {
      return { command: "help", help: true };
    }
    if (!raw) {
      return { command: "run", help };
    }
    return { command: "help", help: true };
  }

  if (raw === "init" || raw === "health" || raw === "run") {
    return { command: raw, help };
  }
  // Back-compat: older docs used `serve`; treat as `run`.
  if (raw === "serve") {
    return { command: "run", help };
  }

  return { command: "help", help: true };
}

function printHelp(): void {
  console.log(`
db90-mcp — DB90 MCP server (phase-0 no-op)

Usage:
  db90-mcp [command] [options]

Commands:
  run         Start the MCP stdio server (default — used by Claude Code).
  init        Print the ~/.claude.json MCP snippet (no auth, no file writes).
  health      Minimal process diagnostic for this phase.

Options:
  --help, -h  Show this help message.
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
`);
}

function runHealth(): void {
  console.log("db90-mcp: ok (phase-0 no-op; no sync, no auth)");
}

async function runMcpServer(): Promise<void> {
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
    case "health":
      runHealth();
      return;
    case "init":
      printInitSnippet();
      return;
    case "run":
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
