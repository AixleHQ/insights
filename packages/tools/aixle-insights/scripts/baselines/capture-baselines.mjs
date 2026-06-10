#!/usr/bin/env node
/**
 * One-shot baseline capture script for Layer A wire-byte parity.
 *
 * Reads the 3 fixture inputs (.input.json) in this directory, calls the
 * package's `mapTranscriptTurn` against each, writes the resulting payloads
 * as .expected.json files alongside.
 *
 * The script is PORTABLE: it resolves the package source via relative path
 * from its own location (../../dist/readers/claude.js), so the same script
 * works whether placed under
 *   packages/tools/aixle-insights/scripts/baselines/  (PR branch — NEW code)
 * or
 *   packages/tools/db90-telemetry-mcp/scripts/baselines/  (worktree on
 *   891bf90 — OLD code)
 *
 * Workflow for capturing the @db90/telemetry-mcp@0.0.1 baseline (one-time):
 *   1. git worktree add ../db90-rails-891bf90 891bf90
 *   2. cp packages/tools/aixle-insights/scripts/baselines/*.input.json \
 *        ../db90-rails-891bf90/packages/tools/db90-telemetry-mcp/scripts/baselines/
 *      (mkdir -p first if needed)
 *   3. cp packages/tools/aixle-insights/scripts/baselines/capture-baselines.mjs \
 *        ../db90-rails-891bf90/packages/tools/db90-telemetry-mcp/scripts/baselines/
 *   4. cd ../db90-rails-891bf90/packages/tools && npm ci && npm run -ws build
 *   5. node db90-telemetry-mcp/scripts/baselines/capture-baselines.mjs
 *   6. cp db90-telemetry-mcp/scripts/baselines/*.expected.json \
 *        <original-repo>/packages/tools/aixle-insights/scripts/baselines/
 *   7. cd <original-repo> && git worktree remove ../db90-rails-891bf90
 *   8. Commit the .expected.json files on the PR branch.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Resolve the built package: go up scripts/baselines/ → scripts/ → package root, then into dist/
const PKG_ROOT = resolve(here, "..", "..");
const DIST_DIR = join(PKG_ROOT, "dist");

const { mapTranscriptTurn } = await import(join(DIST_DIR, "readers", "claude.js"));
const { DEFAULT_PRICING } = await import(join(DIST_DIR, "pricing.js"));

const inputs = readdirSync(here)
  .filter((f) => f.endsWith(".input.json"))
  .sort();

if (inputs.length === 0) {
  console.error("No *.input.json fixtures found in " + here);
  process.exit(1);
}

console.log(`Found ${inputs.length} fixture(s).`);

for (const inputName of inputs) {
  const inputPath = join(here, inputName);
  const fixture = JSON.parse(readFileSync(inputPath, "utf-8"));
  const { turn, options: rawOptions } = fixture;
  const options = {};
  if (rawOptions?.projectId !== undefined) options.projectId = rawOptions.projectId;
  if (rawOptions?.usePricingTable) options.pricing = DEFAULT_PRICING;

  const payload = mapTranscriptTurn(turn, options);

  const expectedName = inputName.replace(/\.input\.json$/, ".expected.json");
  const expectedPath = join(here, expectedName);
  writeFileSync(expectedPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`  ✓ ${inputName} → ${expectedName}`);
}

console.log(`\nDone. Wrote ${inputs.length} .expected.json file(s) under ${here}`);
