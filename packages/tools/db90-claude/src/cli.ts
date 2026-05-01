#!/usr/bin/env node
import { loadBaseConfig } from "@db90/sdk";
import { migrateLegacyState, APP_DIR } from "./state.js";
import { resolveProjectId } from "./project-resolver.js";
import { type PricingTable, DEFAULT_PRICING, mergePricing } from "./pricing.js";
import { syncOnce, type SyncOptions } from "./sync.js";

interface Config {
  token?: string;
  host?: string;
  project_id?: string;
  pricing?: PricingTable;
}

/** Minimal structural check: is this an object whose values are all objects? */
function isPricingTable(value: unknown): value is PricingTable {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "object" && v !== null && !Array.isArray(v))
  );
}

export function loadConfig(dir?: string): Config {
  return loadBaseConfig<PricingTable>(dir ?? APP_DIR, (raw) =>
    isPricingTable(raw.pricing) ? (raw.pricing as PricingTable) : undefined
  );
}

import { type BaseArgs, BASE_ARGS_DEFAULTS, extractEqualsValue } from "@db90/sdk";

export interface Args extends BaseArgs {
  watch: boolean;
  watchInterval: number;
}

/** Parse --watch-interval value; falls back to 30 if non-positive or non-finite. */
function parseWatchInterval(raw: string): number {
  const v = parseInt(raw, 10);
  return Number.isFinite(v) && v >= 1 ? v : 30;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const result: Args = {
    ...BASE_ARGS_DEFAULTS,
    watch: false,
    watchInterval: 30,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--token":
        result.token = args[++i];
        break;
      case "--host":
        result.host = args[++i];
        break;
      case "--project-id":
        result.projectId = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--watch":
        result.watch = true;
        break;
      case "--watch-interval":
        result.watchInterval = parseWatchInterval(args[++i] ?? "");
        break;
      case "--verbose":
      case "-v":
        result.verbose = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default: {
        const tokenEq = extractEqualsValue(arg, "--token");
        const hostEq = extractEqualsValue(arg, "--host");
        const projectIdEq = extractEqualsValue(arg, "--project-id");
        const watchIntervalEq = extractEqualsValue(arg, "--watch-interval");
        if (tokenEq !== undefined) result.token = tokenEq;
        else if (hostEq !== undefined) result.host = hostEq;
        else if (projectIdEq !== undefined) result.projectId = projectIdEq;
        else if (watchIntervalEq !== undefined) {
          result.watchInterval = parseWatchInterval(watchIntervalEq);
        }
        break;
      }
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
db90-claude — Push Claude Code usage events to db90

Usage:
  db90-claude --token <ingest-token> --host <db90-host> [options]

Options:
  --token <token>            db90 ingest token (or DB90_TOKEN env var)
  --host <host>              db90 host URL (or DB90_HOST env var)
  --project-id <uuid>        Associate events with this project UUID
  --dry-run                  Print events without posting or updating state
  --watch                    Poll for new transcripts on an interval
  --watch-interval <secs>    Poll interval in seconds (default: 30)
  --verbose, -v              Print transcript paths and event counts
  --help, -h                 Show this help message

Config file: ~/.db90-claude/config.json
  { "token": "...", "host": "https://app.db90.io", "project_id": "...",
    "pricing": { "<model-id>": { "input_per_mtok": 3.00, "output_per_mtok": 15.00,
                                  "cache_write_per_mtok": 3.75, "cache_read_per_mtok": 0.30 } } }
  The "pricing" key overrides per-model rates used for cost_usd estimation.
  For models not in the default table, supply all four *_per_mtok fields.

Reads transcripts from:
  ~/.config/claude/projects/  (Claude Code v1.0.30+)
  ~/.claude/projects/          (legacy)
`);
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv);

  if (cliArgs.help) {
    printHelp();
    process.exit(0);
  }

  const fileConfig = loadConfig();

  const token = cliArgs.token ?? process.env["DB90_TOKEN"] ?? fileConfig.token;
  const host = cliArgs.host ?? process.env["DB90_HOST"] ?? fileConfig.host;
  const pricing = mergePricing(DEFAULT_PRICING, fileConfig.pricing ?? {});

  if (!token) {
    console.error(
      "Error: --token is required (or set DB90_TOKEN env var or add to ~/.db90-claude/config.json)"
    );
    process.exit(1);
  }

  if (!host) {
    console.error(
      "Error: --host is required (or set DB90_HOST env var or add to ~/.db90-claude/config.json)"
    );
    process.exit(1);
  }

  // Run once at startup — renames legacy state.json to the per-credential filename
  // if it exists and the new file does not. No-op on all subsequent runs.
  migrateLegacyState(APP_DIR, host, token);

  const resolution = await resolveProjectId(
    cliArgs.projectId,
    fileConfig.project_id,
    host,
    token,
    cliArgs.verbose
  );

  if (cliArgs.verbose) {
    console.log(
      `[verbose] Project attribution: ${resolution.projectId ?? "none"} (source: ${resolution.source})`
    );
  }

  const syncOptions: SyncOptions = {
    token,
    host,
    dryRun: cliArgs.dryRun,
    verbose: cliArgs.verbose,
    projectId: resolution.projectId,
    pricing,
  };

  if (cliArgs.watch) {
    console.log(
      `Watching for Claude transcripts every ${cliArgs.watchInterval}s… (Ctrl+C to stop)`
    );

    const runSync = async () => {
      const result = await syncOnce(syncOptions);
      if (result.sent > 0 || result.failed > 0) {
        console.log(
          `Sent: ${result.sent}, Failed: ${result.failed}, Skipped: ${result.skipped}`
        );
      }
    };

    await runSync();
    const interval = setInterval(() => {
      runSync().catch((err) => {
        console.error("Error during sync:", err instanceof Error ? err.message : String(err));
      });
    }, cliArgs.watchInterval * 1000);

    // Keep process alive
    process.on("SIGINT", () => {
      clearInterval(interval);
      console.log("\nStopped.");
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      clearInterval(interval);
      process.exit(0);
    });

    return;
  }

  const result = await syncOnce(syncOptions);
  console.log(`Sent: ${result.sent}, Failed: ${result.failed}, Skipped: ${result.skipped}`);

  if (result.failed > 0) {
    process.exit(1);
  }
}

// Only execute when run directly (not when imported by tests).
// Resolve both paths with realpathSync because npm's bin installer creates a
// symlink at node_modules/.bin/db90-claude → ../@db90/claude/dist/cli.js.
// When users run `db90-claude` or `npx @db90/claude`, Node keeps argv[1] as
// the symlink path while import.meta.url resolves to the real file — so a
// naive string compare would always be false and main() would never fire.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
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
    console.error(
      "Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  });
}
