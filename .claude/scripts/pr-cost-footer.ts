/**
 * pr-cost-footer.ts — Compare token + dollar spend across three strategies, so each PR
 * carries the data that answers "should we keep using the advisor/executor pattern?".
 *
 * Outputs a markdown table comparing three options on the same workload:
 *   A. Single Sonnet  — no pattern, no advisor, no model split.
 *   B. Single Opus    — no pattern, no advisor, no model split.
 *   C. Pattern        — chosen executor + 70% cache + N Opus advisor calls.
 *
 * Plus two delta lines (C vs A, C vs B) and a bottom-line decision string.
 *
 * Why three rows: comparing only against an all-Opus baseline (the script's
 * previous design) hid the more important question — does the pattern reduce
 * cost vs running the same work on a single model with no advisor calls?
 * The math says: typically NO. The pattern adds advisor fixed cost (~$1.20/call)
 * on top of executor cost; cache discounts apply to *both* single-model and
 * pattern, so they don't favor the pattern. The pattern is therefore a
 * **quality premium**, not a cost-saving strategy. The bottom-line string
 * names this honestly so the team can decide whether the advisor calls earn
 * their keep on each PR.
 *
 * Heuristics:
 *   - Input tokens  ≈ lines_changed × 10 + files_changed × 1500 + fixed_overhead
 *   - Output tokens ≈ lines_added   × 10 + files_changed × 200  + fixed_overhead
 *   - Cache hit on input: 70% applied to all three options equally (long sessions).
 *   - Each advisor call ≈ 50K input + 5K output at Opus rates.
 *
 * Pricing (USD per 1M tokens, approximate Anthropic list at time of writing):
 *   - Opus 4.7  : $15.00 input, $75.00 output, $1.50 cached
 *   - Sonnet 4.6: $3.00  input, $15.00 output, $0.30 cached
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings \
 *     .claude/scripts/pr-cost-footer.ts \
 *     [--ref develop..HEAD] [--executor sonnet|opus] [--advisor-calls 2]
 *
 * Defaults: ref=develop..HEAD, executor=sonnet, advisor-calls=2.
 *
 * Cross-platform: Node.js only. Uses execFileSync (no shell) for the single
 * git invocation — input is argv-bounded but the no-shell pattern is the
 * codebase convention.
 */

import { execFileSync } from "node:child_process";

interface ModelRates {
  inputPerM: number;
  outputPerM: number;
  cachedPerM: number;
}

const RATES: Record<"opus" | "sonnet", ModelRates> = {
  opus: { inputPerM: 15.0, outputPerM: 75.0, cachedPerM: 1.5 },
  sonnet: { inputPerM: 3.0, outputPerM: 15.0, cachedPerM: 0.3 },
};

const FIXED_INPUT_OVERHEAD = 8_000;
const FIXED_OUTPUT_OVERHEAD = 1_500;
const ADVISOR_INPUT_PER_CALL = 50_000;
const ADVISOR_OUTPUT_PER_CALL = 5_000;
const CACHE_HIT_RATIO = 0.7;

interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function parseArgs(argv: string[]): {
  ref: string;
  executor: "opus" | "sonnet";
  advisorCalls: number;
} {
  let ref = "develop..HEAD";
  let executor: "opus" | "sonnet" = "sonnet";
  let advisorCalls = 2;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ref") ref = argv[++i] ?? ref;
    else if (a === "--executor") {
      const v = argv[++i];
      if (v === "opus" || v === "sonnet") executor = v;
    } else if (a === "--advisor-calls") {
      advisorCalls = Math.max(0, Number(argv[++i]) || 0);
    }
  }
  return { ref, executor, advisorCalls };
}

function gitDiffStats(ref: string): DiffStats {
  const out = execFileSync("git", [ "diff", "--shortstat", ref ], { encoding: "utf8" }).trim();
  const filesChanged = Number(/(\d+) files? changed/.exec(out)?.[1] ?? "0");
  const linesAdded = Number(/(\d+) insertions?\(\+\)/.exec(out)?.[1] ?? "0");
  const linesRemoved = Number(/(\d+) deletions?\(-\)/.exec(out)?.[1] ?? "0");
  return { filesChanged, linesAdded, linesRemoved };
}

function estimateExecutorTokens(stats: DiffStats): { input: number; output: number } {
  const linesTouched = stats.linesAdded + stats.linesRemoved;
  const input = Math.round(linesTouched * 10 + stats.filesChanged * 1_500 + FIXED_INPUT_OVERHEAD);
  const output = Math.round(stats.linesAdded * 10 + stats.filesChanged * 200 + FIXED_OUTPUT_OVERHEAD);
  return { input, output };
}

function costFor(
  rate: ModelRates,
  inputTokens: number,
  outputTokens: number,
  cacheHitRatio: number
): CostEstimate {
  const cached = inputTokens * cacheHitRatio;
  const fresh = inputTokens - cached;
  const costUsd =
    (fresh * rate.inputPerM) / 1_000_000 +
    (cached * rate.cachedPerM) / 1_000_000 +
    (outputTokens * rate.outputPerM) / 1_000_000;
  return { inputTokens, outputTokens, costUsd };
}

function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function renderMarkdown(args: {
  singleSonnet: CostEstimate;
  singleOpus: CostEstimate;
  pattern: CostEstimate;
  executor: "opus" | "sonnet";
  advisorCalls: number;
  stats: DiffStats;
}): string {
  const { singleSonnet, singleOpus, pattern, executor, advisorCalls, stats } = args;

  const totalTokens = (e: CostEstimate): number => e.inputTokens + e.outputTokens;
  const dvsSonnet = singleSonnet.costUsd - pattern.costUsd;
  const dvsSonnetPct = singleSonnet.costUsd > 0 ? (dvsSonnet / singleSonnet.costUsd) * 100 : 0;
  const dvsOpus = singleOpus.costUsd - pattern.costUsd;
  const dvsOpusPct = singleOpus.costUsd > 0 ? (dvsOpus / singleOpus.costUsd) * 100 : 0;

  // Bottom-line decision — answers the actual question: should we keep the pattern?
  //   - C ≤ A AND C ≤ B  → pattern is the cheapest option overall (rare; only on huge sessions
  //                         where Sonnet cache + advisor savings outweigh advisor fixed cost)
  //   - C > A AND C ≤ B  → pattern is a quality premium over Sonnet, but cheaper than Opus
  //                         (the typical case when executor=sonnet)
  //   - C > A AND C > B  → pattern is the most expensive — both levers worth re-examining
  //                         (executor model AND advisor frequency)
  const cheaperThanSonnet = dvsSonnet >= 0;
  const cheaperThanOpus = dvsOpus >= 0;
  let bottomLine: string;
  if (cheaperThanSonnet && cheaperThanOpus) {
    bottomLine = `**Decision: ✅ pattern is the cheapest option** — keep using it.`;
  } else if (!cheaperThanSonnet && cheaperThanOpus) {
    bottomLine =
      `**Decision: pattern is a quality premium of ${formatUsd(-dvsSonnet)} over single Sonnet** — ` +
      `pattern adds advisor-call fixed cost on top of executor cost. ` +
      `Keep using the pattern only if those advisor calls prevent rework worth more than ${formatUsd(-dvsSonnet)}.`;
  } else if (!cheaperThanSonnet && !cheaperThanOpus) {
    bottomLine =
      `**Decision: ⚠️ pattern is the most expensive option** — ` +
      `${executor === "opus" ? "switch executor to Sonnet" : "drop or reduce advisor calls"} on similar PRs.`;
  } else {
    // Cheaper than Sonnet but more expensive than Opus — implausible given the model rates,
    // but kept for completeness.
    bottomLine = `**Decision: pattern beats Sonnet but trails Opus** — unusual; double-check the inputs.`;
  }

  const fmtDelta = (d: number, pct: number): string =>
    d >= 0
      ? `**−${formatUsd(d)} (${pct.toFixed(0)}% cheaper)**`
      : `**+${formatUsd(-d)} (${(-pct).toFixed(0)}% more)**`;

  return [
    "## Cost footprint (estimated, ±50%)",
    "",
    `_${stats.filesChanged} file(s) changed, +${stats.linesAdded}/-${stats.linesRemoved} lines._`,
    "",
    "### Cost comparison",
    "",
    "| Strategy | Input | Output | Total tokens | Cost |",
    "|---|---|---|---|---|",
    `| **A. Single Sonnet** (no pattern) | ~${formatTokens(singleSonnet.inputTokens)} | ~${formatTokens(singleSonnet.outputTokens)} | ~${formatTokens(totalTokens(singleSonnet))} | **${formatUsd(singleSonnet.costUsd)}** |`,
    `| **B. Single Opus** (no pattern) | ~${formatTokens(singleOpus.inputTokens)} | ~${formatTokens(singleOpus.outputTokens)} | ~${formatTokens(totalTokens(singleOpus))} | **${formatUsd(singleOpus.costUsd)}** |`,
    `| **C. Pattern** (${executor} + cache + ${advisorCalls}× advisor) | ~${formatTokens(pattern.inputTokens)} | ~${formatTokens(pattern.outputTokens)} | ~${formatTokens(totalTokens(pattern))} | **${formatUsd(pattern.costUsd)}** |`,
    "",
    "### Pattern impact",
    "",
    `- C vs A (Sonnet alone): ${fmtDelta(dvsSonnet, dvsSonnetPct)}`,
    `- C vs B (Opus alone):   ${fmtDelta(dvsOpus, dvsOpusPct)}`,
    "",
    bottomLine,
    "",
    "<sub>Estimates are heuristic (lines × tokens-per-line + file-read overhead). Actual telemetry varies; this is a comparison ratio, not a bill. Generated by `.claude/scripts/pr-cost-footer.ts`.</sub>",
  ].join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const stats = gitDiffStats(args.ref);

  if (stats.filesChanged === 0) {
    console.error(`No changes in ref range '${args.ref}'.`);
    process.exit(1);
  }

  const exec = estimateExecutorTokens(stats);

  // A. Single Sonnet — no pattern, no advisor. Cache discount applies (long sessions
  // get cache hits regardless of pattern), so we use the same CACHE_HIT_RATIO as the
  // pattern. This makes the comparison apples-to-apples on caching; the only structural
  // difference between A and C is the advisor calls.
  const singleSonnet = costFor(RATES.sonnet, exec.input, exec.output, CACHE_HIT_RATIO);

  // B. Single Opus — no pattern, no advisor, same caching baseline.
  const singleOpus = costFor(RATES.opus, exec.input, exec.output, CACHE_HIT_RATIO);

  // C. Pattern — chosen executor with cache + N Opus advisor calls.
  const executorCost = costFor(RATES[args.executor], exec.input, exec.output, CACHE_HIT_RATIO);
  const advisorCost = costFor(
    RATES.opus,
    args.advisorCalls * ADVISOR_INPUT_PER_CALL,
    args.advisorCalls * ADVISOR_OUTPUT_PER_CALL,
    0
  );
  const pattern: CostEstimate = {
    inputTokens: executorCost.inputTokens + advisorCost.inputTokens,
    outputTokens: executorCost.outputTokens + advisorCost.outputTokens,
    costUsd: executorCost.costUsd + advisorCost.costUsd,
  };

  console.log(
    renderMarkdown({
      singleSonnet,
      singleOpus,
      pattern,
      executor: args.executor,
      advisorCalls: args.advisorCalls,
      stats,
    })
  );
}

main();
