#!/usr/bin/env node
import { loadBaseConfig, resolveProjectId } from "@db90/sdk";
import { APP_DIR } from "./state.js";
import { DEFAULT_PRICING } from "./mapper.js";
import type { PricingConfig } from "./mapper.js";
import { syncOnce } from "./sync.js";

interface Config {
  token?: string;
  host?: string;
  project_id?: string;
  pricing?: Partial<PricingConfig>;
}

function parsePricing(raw: Record<string, unknown>): Partial<PricingConfig> | undefined {
  const rawPricing =
    typeof raw.pricing === "object" && raw.pricing !== null
      ? (raw.pricing as Record<string, unknown>)
      : null;
  if (!rawPricing) return undefined;

  const pricing: Partial<PricingConfig> = {};
  for (const key of [
    "tokens_per_line",
    "completion_output_per_mtok",
    "chat_input_per_mtok",
    "chat_output_per_mtok",
  ] as const) {
    const value = rawPricing[key];
    // Guard empty string before Number(): Number("") === 0 would silently zero out a rate.
    if (value == null || value === "" || typeof value === "boolean") continue;
    const num = Number(value);
    if (!isNaN(num) && num >= 0) pricing[key] = num;
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function loadConfig(): Config {
  return loadBaseConfig<Partial<PricingConfig>>(APP_DIR, parsePricing);
}

import { type BaseArgs, BASE_ARGS_DEFAULTS, extractEqualsValue } from "@db90/sdk";

export interface Args extends BaseArgs {
  since?: string;
}

export function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const result: Args = { ...BASE_ARGS_DEFAULTS };

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
      default: {
        const tokenEq = extractEqualsValue(arg, "--token");
        const hostEq = extractEqualsValue(arg, "--host");
        const projectIdEq = extractEqualsValue(arg, "--project-id");
        const sinceEq = extractEqualsValue(arg, "--since");
        if (tokenEq !== undefined) result.token = tokenEq;
        else if (hostEq !== undefined) result.host = hostEq;
        else if (projectIdEq !== undefined) result.projectId = projectIdEq;
        else if (sinceEq !== undefined) result.since = sinceEq;
        break;
      }
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
  --token <token>      db90 ingest token (or DB90_TOKEN env var)
  --host <host>        db90 host URL (or DB90_HOST env var)
  --project-id <uuid>  Associate events with this project UUID
  --dry-run            Print events without posting or updating state
  --since <date>       Process events since this ISO date (overrides saved state)
  --verbose, -v        Print Cursor DB paths, table names, and event counts
  --help, -h           Show this help message

Config file: ~/.db90-cursor/config.json
  {
    "token": "...",
    "host": "https://app.db90.io",
    "project_id": "...",
    "pricing": {
      "tokens_per_line": 15,
      "completion_output_per_mtok": 0.60,
      "chat_input_per_mtok": 3.00,
      "chat_output_per_mtok": 15.00
    }
  }
  All pricing values must be non-negative numbers; invalid or negative values
  are ignored and the default is used for that field.
`);
}

function parseSinceArg(sinceArg: string | undefined): Date | null | undefined {
  if (sinceArg === undefined) return undefined;
  const since = new Date(sinceArg);
  if (isNaN(since.getTime())) {
    console.error(`Error: invalid --since date: ${sinceArg}`);
    process.exit(1);
  }
  return since;
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

  const pricing: PricingConfig = { ...DEFAULT_PRICING, ...fileConfig.pricing };

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

  const result = await syncOnce({
    token,
    host,
    dryRun: cliArgs.dryRun,
    verbose: cliArgs.verbose,
    projectId: resolution.projectId,
    since: parseSinceArg(cliArgs.since),
    pricing,
  });

  if (result.sent === 0 && result.failed === 0) {
    console.log("No new Cursor events found.");
    return;
  }

  if (cliArgs.dryRun) {
    // syncOnce already printed per-event JSON + the cost-model dry-run note.
    return;
  }

  console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);

  if (result.failed > 0) {
    console.error(`${result.failed} event(s) failed to send.`);
    process.exit(1);
  }
}

// Only execute when run directly (not when imported by tests).
// Resolve both paths with realpathSync because npm's bin installer creates a
// symlink at node_modules/.bin/db90-cursor → ../@db90/cursor/dist/cli.js.
// When users run `db90-cursor` or `npx @db90/cursor`, Node keeps argv[1] as
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
    console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
