#!/usr/bin/env node
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { readState, writeState, APP_DIR } from "./state.js";
import { readEvents, readDailyStats } from "./cursor-reader.js";
import { mapEvent, mapDailyStats } from "./mapper.js";
import { postEvents } from "./client.js";

interface Config {
  token?: string;
  host?: string;
}

function loadConfig(): Config {
  const configPath = join(APP_DIR, "config.json");
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      return {
        token: typeof obj.token === "string" ? obj.token : undefined,
        host: typeof obj.host === "string" ? obj.host : undefined,
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
  dryRun: boolean;
  since?: string;
  verbose: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const result: Args = { dryRun: false, verbose: false, help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--token":
        result.token = args[++i];
        break;
      case "--host":
        result.host = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--verbose":
      case "-v":
        result.verbose = true;
        break;
      case "--since":
        result.since = args[++i];
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default:
        if (arg.startsWith("--token=")) result.token = arg.slice(8);
        else if (arg.startsWith("--host=")) result.host = arg.slice(7);
        else if (arg.startsWith("--since=")) result.since = arg.slice(8);
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
db90-cursor — Push Cursor IDE usage events to db90

Usage:
  db90-cursor --token <ingest-token> --host <db90-host> [options]

Options:
  --token <token>   db90 ingest token (or DB90_TOKEN env var)
  --host <host>     db90 host URL (or DB90_HOST env var)
  --dry-run         Print events without posting or updating state
  --since <date>    Process events since this ISO date (overrides saved state)
  --verbose, -v     Print Cursor DB paths, table names, and event counts
  --help, -h        Show this help message

Config file: ~/.db90-cursor/config.json
  { "token": "...", "host": "https://app.db90.io" }
`);
}

function resolveSinceDate(sinceArg: string | undefined): { since: Date | null; sinceFromState: boolean } {
  if (sinceArg !== undefined) {
    const since = new Date(sinceArg);
    if (isNaN(since.getTime())) {
      console.error(`Error: invalid --since date: ${sinceArg}`);
      process.exit(1);
    }
    return { since, sinceFromState: false };
  }

  const state = readState();
  if (state.lastProcessedAt) {
    const since = new Date(state.lastProcessedAt);
    if (!isNaN(since.getTime())) {
      return { since, sinceFromState: true };
    }
  }
  return { since: null, sinceFromState: true };
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv);

  if (cliArgs.help) {
    printHelp();
    process.exit(0);
  }

  const fileConfig = loadConfig();

  const token = cliArgs.token ?? process.env.DB90_TOKEN ?? fileConfig.token;
  const host = cliArgs.host ?? process.env.DB90_HOST ?? fileConfig.host;

  if (!token) {
    console.error("Error: --token is required (or set DB90_TOKEN env var or add to ~/.db90-cursor/config.json)");
    process.exit(1);
  }

  if (!host) {
    console.error("Error: --host is required (or set DB90_HOST env var or add to ~/.db90-cursor/config.json)");
    process.exit(1);
  }

  const { since, sinceFromState } = resolveSinceDate(cliArgs.since);

  const rawEvents = readEvents(since, undefined, cliArgs.verbose);
  const dailyStats = readDailyStats(since, undefined, cliArgs.verbose);

  const mappedFromEvents = rawEvents
    .map(({ row, workspacePath }) => mapEvent(row, workspacePath))
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const mappedFromStats = dailyStats.flatMap((entry) => mapDailyStats(entry));

  const mappedEvents = [...mappedFromEvents, ...mappedFromStats];

  if (mappedEvents.length === 0) {
    console.log("No new Cursor events found.");
    // Do NOT advance state when there are no events — clock-skew or
    // backfilled rows with older timestamps would be silently skipped.
    return;
  }

  if (cliArgs.dryRun) {
    console.log(`[dry-run] Would send ${mappedEvents.length} event(s):`);
    for (const event of mappedEvents) {
      console.log(JSON.stringify(event, null, 2));
    }
    return;
  }

  const result = await postEvents(mappedEvents, host, token);
  console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);

  if (result.failed > 0) {
    console.error(`${result.failed} event(s) failed to send.`);
    // Still save progress for any events that did succeed so we don't re-send them.
    if (result.lastSentAt !== null && sinceFromState) {
      writeState({ lastProcessedAt: result.lastSentAt });
    }
    process.exit(1);
  }

  // Advance watermark to the max occurred_at of sent events, not wall-clock "now".
  // This avoids skipping rows with timestamps earlier than "now" (backfills, clock skew).
  if (sinceFromState && result.lastSentAt !== null) {
    writeState({ lastProcessedAt: result.lastSentAt });
  }
}

// Only execute when run directly (not when imported by tests)
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
