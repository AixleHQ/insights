#!/usr/bin/env node
/**
 * CUR-V13 — install user-level ~/.cursor/hooks.json for feasibility logging.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  USER_HOOKS_JSON,
  buildUserHooksConfig,
  defaultLoggerScriptPath,
  parseHooksJson,
  redactHomePath,
} from "../src/hooks-feasibility.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const loggerPath = defaultLoggerScriptPath(packageRoot);

function main(): void {
  const loggerSource = loggerPath;
  if (!existsSync(loggerSource)) {
    console.error(`Logger not found: ${loggerSource}`);
    process.exit(1);
  }

  try {
    chmodSync(loggerSource, 0o755);
  } catch {
    // Windows or permission — node can still invoke via `node path`
  }

  const config = buildUserHooksConfig(loggerSource);

  if (existsSync(USER_HOOKS_JSON)) {
    const backup = `${USER_HOOKS_JSON}.bak-${Date.now()}`;
    copyFileSync(USER_HOOKS_JSON, backup);
    const existing = parseHooksJson(readFileSync(USER_HOOKS_JSON, "utf-8"));
    if (existing?.hooks) {
      console.warn(
        `Existing ${redactHomePath(USER_HOOKS_JSON)} backed up to ${redactHomePath(backup)}.`
      );
      console.warn(
        "This installer replaces hooks with sessionEnd + postToolUse loggers only."
      );
    }
  }

  mkdirSync(dirname(USER_HOOKS_JSON), { recursive: true });
  writeFileSync(USER_HOOKS_JSON, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  console.log("Cursor hooks feasibility logger installed (CUR-V13)\n");
  console.log(`Wrote: ${redactHomePath(USER_HOOKS_JSON)}`);
  console.log(`Logger: ${redactHomePath(loggerPath)}`);
  console.log(`Log file: ~/.cursor/db90-hooks-feasibility.ndjson`);
  console.log("\nNext:");
  console.log("  1. Restart Cursor (or reload window).");
  console.log("  2. Run Agent/Composer with Auto mode; use a tool once.");
  console.log("  3. npm run verify:hooks-feasibility");
}

main();
