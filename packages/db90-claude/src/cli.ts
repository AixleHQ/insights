#!/usr/bin/env node
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { readState, writeState, markSessionSent, APP_DIR } from "./state.js";
import { findTranscriptFiles, parseTranscriptFile, toDb90Payload } from "./claude-reader.js";
import { postEvent } from "./client.js";
import { resolveProjectId } from "./project-resolver.js";
import { type PricingTable, DEFAULT_PRICING, mergePricing, getCostWarning } from "./pricing.js";

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
  const configPath = join(dir ?? APP_DIR, "config.json");
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      return {
        token: typeof obj.token === "string" ? obj.token : undefined,
        host: typeof obj.host === "string" ? obj.host : undefined,
        project_id: typeof obj.project_id === "string" ? obj.project_id : undefined,
        pricing: isPricingTable(obj.pricing) ? (obj.pricing as PricingTable) : undefined,
      };
    }
  } catch {
    // missing or invalid config — fall through
  }
  return {};
}

export interface Args {
  token?: string;
  host?: string;
  projectId?: string;
  dryRun: boolean;
  watch: boolean;
  watchInterval: number;
  verbose: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const result: Args = {
    dryRun: false,
    watch: false,
    watchInterval: 30,
    verbose: false,
    help: false,
    projectId: undefined,
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
        result.watchInterval = parseInt(args[++i] ?? "30", 10);
        break;
      case "--verbose":
      case "-v":
        result.verbose = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default:
        if (arg.startsWith("--token=")) result.token = arg.slice(8);
        else if (arg.startsWith("--host=")) result.host = arg.slice(7);
        else if (arg.startsWith("--project-id=")) result.projectId = arg.slice(13);
        else if (arg.startsWith("--watch-interval=")) {
          result.watchInterval = parseInt(arg.slice(17), 10);
        }
        break;
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

interface SyncResult {
  sent: number;
  failed: number;
  skipped: number;
}

async function syncOnce(
  token: string,
  host: string,
  dryRun: boolean,
  verbose: boolean,
  projectId: string | null,
  pricing: PricingTable
): Promise<SyncResult> {
  const files = findTranscriptFiles();

  if (verbose) {
    console.log(`[verbose] Found ${files.length} transcript file(s)`);
  }

  let state = readState(APP_DIR, host, token);
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const filePath of files) {
    const sessions = await parseTranscriptFile(filePath, verbose);

    for (const [sessionId, agg] of sessions) {
      const known = state.sessions[sessionId];

      // Skip if file size hasn't changed since last successful send
      if (known && known.fileSize === agg.fileSize) {
        totalSkipped++;
        if (verbose) {
          console.log(`[verbose] Skipping unchanged session ${sessionId}`);
        }
        continue;
      }

      const payload = toDb90Payload(agg, { projectId: projectId ?? undefined, pricing });

      if (verbose && payload.cost_usd === null) {
        if (!agg.model) {
          if (agg.tokensIn > 0 || agg.tokensOut > 0) {
            console.warn(`[warn] Session ${sessionId} has usage but no model — cost_usd will be null`);
          }
        } else {
          const warning = getCostWarning(agg.model, pricing);
          if (warning) console.warn(`[warn] ${warning}`);
        }
      }

      if (dryRun) {
        console.log(`[dry-run] Would send session ${sessionId}:`);
        console.log(JSON.stringify(payload, null, 2));
        totalSent++;
        continue;
      }

      if (verbose) {
        console.log(`[verbose] Sending session ${sessionId} (${agg.tokensIn + agg.tokensOut} tokens)`);
      }

      const ok = await postEvent(payload, host, token);
      if (ok) {
        state = markSessionSent(state, sessionId, agg.fileSize);
        writeState(state, APP_DIR, host, token);
        totalSent++;
      } else {
        totalFailed++;
      }
    }
  }

  return { sent: totalSent, failed: totalFailed, skipped: totalSkipped };
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

  if (cliArgs.watch) {
    console.log(
      `Watching for Claude transcripts every ${cliArgs.watchInterval}s… (Ctrl+C to stop)`
    );

    const runSync = async () => {
      const result = await syncOnce(token, host, cliArgs.dryRun, cliArgs.verbose, resolution.projectId, pricing);
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

  const result = await syncOnce(token, host, cliArgs.dryRun, cliArgs.verbose, resolution.projectId, pricing);
  console.log(`Sent: ${result.sent}, Failed: ${result.failed}, Skipped: ${result.skipped}`);

  if (result.failed > 0) {
    process.exit(1);
  }
}

// Only execute when run directly (not when imported by tests)
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(
      "Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  });
}
