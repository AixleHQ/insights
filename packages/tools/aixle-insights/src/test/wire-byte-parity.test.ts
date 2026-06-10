/**
 * Wire-byte parity tests (Layer A of the @db90/telemetry-mcp → @aixle/insights
 * verification harness — see plans/aixle-insights-migration/VERIFY-LOCALLY.md).
 *
 * For each fixture in scripts/baselines/*.input.json, calls the renamed
 * package's `mapTranscriptTurn` and asserts the resulting payload is BYTE-
 * IDENTICAL to the corresponding *.expected.json — which was captured
 * one-time from @db90/telemetry-mcp@0.0.1 at commit 891bf90 (last develop
 * commit before this PR).
 *
 * Stronger than the existing `claude-payload-contract.test.ts`: that spec
 * pins individual key/value assertions, but doesn't catch silent additions
 * of new metadata keys, reordering, or formatting drift. This spec catches
 * any structural change in the JSON output, however subtle.
 *
 * If a test fails here, the renamed code has produced different bytes from
 * the pre-rename code for the same input — a wire-format regression.
 * Investigate `src/readers/claude.ts` `mapTranscriptTurn` against the
 * 891bf90 equivalent (`git worktree add ../baseline 891bf90` to inspect).
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mapTranscriptTurn, type ClaudeTranscriptTurn } from "../readers/claude.js";
import { DEFAULT_PRICING } from "../pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINES_DIR = resolve(here, "..", "..", "scripts", "baselines");

interface FixtureInput {
  turn: ClaudeTranscriptTurn;
  options?: {
    projectId?: string | null;
    usePricingTable?: boolean;
  };
}

const inputFiles = readdirSync(BASELINES_DIR)
  .filter((f) => f.endsWith(".input.json"))
  .sort();

describe("Wire-byte parity (Layer A: locks against the 891bf90 baseline)", () => {
  if (inputFiles.length === 0) {
    it.fails("baselines directory is empty — run scripts/baselines/capture-baselines.mjs first", () => {});
    return;
  }

  for (const inputName of inputFiles) {
    const expectedName = inputName.replace(/\.input\.json$/, ".expected.json");
    const inputPath = join(BASELINES_DIR, inputName);
    const expectedPath = join(BASELINES_DIR, expectedName);

    it(`${inputName}: emits byte-identical payload as 891bf90`, () => {
      const fixture = JSON.parse(readFileSync(inputPath, "utf-8")) as FixtureInput;
      const options: { projectId?: string | null; pricing?: typeof DEFAULT_PRICING } = {};
      if (fixture.options?.projectId !== undefined) options.projectId = fixture.options.projectId;
      if (fixture.options?.usePricingTable) options.pricing = DEFAULT_PRICING;

      const actual = mapTranscriptTurn(fixture.turn, options);
      const expected = JSON.parse(readFileSync(expectedPath, "utf-8"));

      // Byte-identity via stable JSON.stringify with the same indent the
      // baseline was captured with. If even one key is reordered, added,
      // or removed, this fails — which is exactly the regression signal we
      // want.
      const actualBytes = JSON.stringify(actual, null, 2) + "\n";
      const expectedBytes = readFileSync(expectedPath, "utf-8");

      expect(actualBytes).toBe(expectedBytes);

      // Belt-and-suspenders deep-equal check in case JSON.stringify of the
      // actual produces a non-canonical ordering that still parses to the
      // same object.
      expect(actual).toEqual(expected);
    });
  }
});
