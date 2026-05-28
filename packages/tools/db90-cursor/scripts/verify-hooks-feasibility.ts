#!/usr/bin/env node
/**
 * CUR-V13 — verify hooks config + captured log fields.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HOOK_LOG_PATH,
  analyzeHookFeasibility,
  defaultLoggerScriptPath,
} from "../src/hooks-feasibility.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const loggerPath = defaultLoggerScriptPath(packageRoot);

function parseArgs(argv: string[]): { jsonOut?: string; smoke: boolean } {
  let jsonOut: string | undefined;
  let smoke = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json-out" && argv[i + 1]) jsonOut = argv[i + 1];
    if (argv[i] === "--smoke") smoke = true;
  }
  return { jsonOut, smoke };
}

function runSmokeInjection(): void {
  const payload = {
    hook_event_name: "postToolUse",
    conversation_id: "db90-v13-smoke",
    generation_id: "gen-smoke",
    model: "claude-sonnet-4-20250514",
    cursor_version: "9.9.9-smoke",
    workspace_roots: [join(packageRoot)],
    tool_name: "Shell",
    duration: 1,
  };
  const result = spawnSync(process.execPath, [loggerPath], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    console.warn(`Smoke injection failed: ${result.stderr || result.stdout}`);
  } else {
    console.log("Smoke event appended to hook log.\n");
  }
}

function main(): void {
  const { jsonOut, smoke } = parseArgs(process.argv);
  if (smoke) runSmokeInjection();

  const projectHooks = join(packageRoot, "..", "..", "..", ".cursor", "hooks.json");
  const report = analyzeHookFeasibility({
    loggerPath,
    projectHooksPath: projectHooks,
  });

  console.log("Cursor hooks feasibility (CUR-V13)\n");
  console.log("hooks.json:");
  for (const p of report.hooks_json_paths) {
    console.log(
      `  ${p.path_redacted}: exists=${p.exists} db90_logger=${p.has_db90_logger}`
    );
  }

  console.log(`\nLog: ${report.log_path_redacted}`);
  console.log(`  lines=${report.log_line_count} sessionEnd=${report.session_end_events} postToolUse=${report.post_tool_use_events}`);
  console.log(`  required fields verified: ${report.required_fields_verified}`);

  if (report.sample_events.length > 0) {
    console.log("\nSample events:");
    for (const ev of report.sample_events) {
      const fields = ev.field_checks
        .map((c) => `${c.field}=${c.populated ? "ok" : "missing"}`)
        .join(", ");
      console.log(`  ${ev.hook_event_name ?? "?"} @ ${ev.captured_at ?? "?"} — ${fields}`);
      if (ev.passes_required_fields && ev.hook_event_name) {
        console.log(`    model field present (check Auto vs resolved in raw Cursor UI).`);
      }
    }
  }

  console.log(`\n${report.ingest_scope_note}`);
  if (report.next_steps.length > 0) {
    console.log("\nNext steps:");
    for (const step of report.next_steps) {
      console.log(`  - ${step}`);
    }
  }

  const json = JSON.stringify(report, null, 2);
  if (jsonOut) {
    writeFileSync(jsonOut, json, "utf-8");
    console.log(`\nWrote ${jsonOut}`);
  }

  if (!report.required_fields_verified && !smoke) {
    console.log(
      `\nTip: npm run verify:hooks-feasibility -- --smoke  (appends a synthetic event to ${DEFAULT_HOOK_LOG_PATH})`
    );
  }

  process.exit(report.required_fields_verified ? 0 : 1);
}

main();
