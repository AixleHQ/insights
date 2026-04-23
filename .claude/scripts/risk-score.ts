/**
 * risk-score.ts — Deterministic risk scoring for /review-changes
 *
 * Collects signals from git and the filesystem, computes a weighted risk score
 * per changed file, and outputs a structured RiskReport JSON to stdout.
 *
 * Signals used (in order of weight):
 *   1. File-path tier    (0–40 pts) — where in the architecture the file lives
 *   2. Blast radius      (0–30 pts) — max(call-site count, 2-hop unique callers) via `git grep`
 *   3. Churn rate        (0–15 pts) — commits in last 90 days
 *   4. Method coverage   (0–15 pts) — diff-parsed method names checked against spec content
 *
 * Aggregation: max(file_scores) + volume bonus (up to +10 for multiple MEDIUM+ files).
 *
 * Hard flags bypass the score and force a minimum risk level:
 *   - db/migrate/ file              → CRITICAL (≥90)
 *   - authorize! added/removed      → HIGH     (≥70)
 *   - destroy_all / delete_all      → CRITICAL (≥90)
 *   - app/policies/ with no spec    → HIGH     (≥70)
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings .claude/scripts/risk-score.ts [REF_RANGE]
 *
 * REF_RANGE defaults to:
 *   --cached         if staged changes exist
 *   HEAD~1..HEAD     otherwise
 *
 * Cross-platform: Node.js only. Uses `git grep` for caller counting (no grep/ripgrep dependency).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectDir: string = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface FileRisk {
  file: string;
  tier: string;
  tier_score: number;
  diff: { lines_added: number; lines_removed: number };
  direct_call_sites: number;
  two_hop_callers: number;
  caller_score: number;
  churn_90d: number;
  churn_score: number;
  has_spec: boolean;
  spec_path: string | null;
  methods_changed: string[];
  methods_covered: string[];
  coverage_score: number;
  hard_flags: string[];
  total_score: number;
  risk_level: RiskLevel;
}

interface RiskReport {
  ref_range: string;
  files_changed: number;
  overall_score: number;
  overall_risk: RiskLevel;
  escalate_to_advisor: boolean;
  escalation_reason: string | null;
  hard_flags_triggered: string[];
  files: FileRisk[];
}

// ─── Tier table ───────────────────────────────────────────────────────────────
//
// Ordered from most to least specific. First match wins.

const TIERS: Array<{ pattern: string; name: string; weight: number }> = [
  { pattern: "db/migrate/",                          name: "migration",    weight: 40 },
  { pattern: "packages/api/app/policies/",           name: "policy",       weight: 35 },
  { pattern: "packages/api/app/domain/",             name: "domain",       weight: 30 },
  { pattern: "packages/api/app/services/",           name: "service",      weight: 28 },
  { pattern: "packages/api/app/models/",             name: "model",        weight: 25 },
  { pattern: "packages/api/app/controllers/",        name: "controller",   weight: 22 },
  { pattern: "packages/api/app/serializers/",        name: "serializer",   weight: 18 },
  { pattern: "packages/web/src/hooks/",              name: "hook",         weight: 20 },
  { pattern: "packages/web/src/contexts/",           name: "context",      weight: 20 },
  { pattern: "packages/web/src/components/ui/",      name: "ui-component", weight: 18 },
  { pattern: "packages/web/src/pages/",              name: "page",         weight: 15 },
  { pattern: "packages/web/src/components/",         name: "component",    weight: 12 },
  { pattern: "packages/web/src/lib/",                name: "lib",          weight: 10 },
  { pattern: "packages/api/spec/",                   name: "spec",         weight:  5 },
  { pattern: "packages/web/src/test/",               name: "spec",         weight:  5 },
  { pattern: ".claude/",                             name: "tooling",      weight:  5 },
];

function resolveTier(file: string): { name: string; weight: number } {
  for (const t of TIERS) {
    if (file.includes(t.pattern)) return { name: t.name, weight: t.weight };
  }
  return { name: "other", weight: 10 };
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function callerScore(count: number): number {
  if (count >= 30) return 30;
  if (count >= 11) return 20;
  if (count >= 3)  return 10;
  return 0;
}

function churnScore(commits: number): number {
  if (commits >= 10) return 15;
  if (commits >= 3)  return 8;
  return 0;
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: projectDir, encoding: "utf8" });
  return r.stdout?.trim() ?? "";
}

function changedFiles(refRange: string): string[] {
  return git(["diff", "--name-only", refRange]).split("\n").filter(Boolean);
}

function diffNumstat(refRange: string): Map<string, { added: number; removed: number }> {
  const map = new Map<string, { added: number; removed: number }>();
  for (const line of git(["diff", "--numstat", refRange]).split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    if (parts.length >= 3) {
      map.set(parts[2], {
        added: parseInt(parts[0], 10) || 0,
        removed: parseInt(parts[1], 10) || 0,
      });
    }
  }
  return map;
}

function churnIn90Days(file: string): number {
  return git(["log", "--oneline", "--since=90 days ago", "--", file])
    .split("\n").filter(Boolean).length;
}

function fileDiff(file: string, refRange: string): string {
  return git(["diff", refRange, "--", file]);
}

/**
 * Resolve the search path and glob for a file based on its extension.
 */
function searchContext(file: string): { searchPath: string; glob: string; symbol: string } {
  const ext = path.extname(file);
  const symbol = path.basename(file, ext);
  const isRuby = ext === ".rb";
  return {
    symbol,
    searchPath: isRuby ? "packages/api/app" : "packages/web/src",
    glob: isRuby ? "*.rb" : "*.{ts,tsx}",
  };
}

/**
 * Count actual call sites (not just files) that reference the given symbol.
 * Uses `git grep -c` which returns `filepath:count` per matching file.
 * Excludes the defining file itself.
 */
function callSiteCount(file: string): number {
  const { symbol, searchPath, glob } = searchContext(file);

  const r = spawnSync(
    "git",
    ["grep", "-c", "--", symbol, `${searchPath}/**/${glob}`],
    { cwd: projectDir, encoding: "utf8" }
  );

  let total = 0;
  for (const line of (r.stdout ?? "").split("\n").filter(Boolean)) {
    // Format: "filepath:count"
    const colonIdx = line.lastIndexOf(":");
    if (colonIdx < 0) continue;
    const matchFile = line.slice(0, colonIdx);
    const count = parseInt(line.slice(colonIdx + 1), 10) || 0;
    // Exclude the defining file itself
    if (matchFile.endsWith(file)) continue;
    total += count;
  }
  return total;
}

/**
 * Count unique files reachable within 2 hops of the given file.
 * Hop 1: files that reference this file's symbol (direct callers).
 * Hop 2: for each direct caller, files that reference the caller's symbol.
 * Returns the total unique file count across both hops (excluding self and specs).
 */
function twoHopCallerCount(file: string): number {
  const { symbol, searchPath, glob } = searchContext(file);

  // Hop 1: direct callers
  const r1 = spawnSync(
    "git",
    ["grep", "-l", "--", symbol, `${searchPath}/**/${glob}`],
    { cwd: projectDir, encoding: "utf8" }
  );

  const directCallers = (r1.stdout ?? "").split("\n").filter(Boolean)
    .filter((f) => !f.endsWith(file));  // exclude self

  if (directCallers.length === 0) return 0;

  // Hop 2: callers of callers
  const allFiles = new Set(directCallers);

  for (const caller of directCallers) {
    // Skip spec files — they don't propagate risk
    if (caller.includes("/spec/") || caller.includes("/test/") || caller.includes(".test.") || caller.includes("_spec.")) continue;

    const callerSymbol = path.basename(caller, path.extname(caller));
    const r2 = spawnSync(
      "git",
      ["grep", "-l", "--", callerSymbol, `${searchPath}/**/${glob}`],
      { cwd: projectDir, encoding: "utf8" }
    );

    for (const hop2File of (r2.stdout ?? "").split("\n").filter(Boolean)) {
      if (!hop2File.endsWith(caller)) {  // exclude the hop-1 file itself
        allFiles.add(hop2File);
      }
    }
  }

  // Remove self from the union
  allFiles.delete(file);
  return allFiles.size;
}

// ─── Spec lookup ──────────────────────────────────────────────────────────────

function findSpec(file: string): string | null {
  const basename = path.basename(file, path.extname(file));

  if (file.includes("packages/api/app/")) {
    const specDir = path.join(projectDir, "packages/api/spec");
    return findFirst(specDir, `${basename}_spec.rb`);
  }

  if (file.includes("packages/web/src/")) {
    const webSrc = path.join(projectDir, "packages/web/src");
    for (const suffix of [".test.tsx", ".test.ts", ".spec.tsx", ".spec.ts"]) {
      const found = findFirst(webSrc, `${basename}${suffix}`);
      if (found) return found;
    }
    const testDir = path.join(projectDir, "packages/web/src/test");
    for (const suffix of [".test.tsx", ".test.ts"]) {
      const found = findFirst(testDir, `${basename}${suffix}`);
      if (found) return found;
    }
  }

  return null;
}

function findFirst(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFirst(full, filename);
        if (found) return found;
      } else if (entry.name === filename) {
        return full;
      }
    }
  } catch { /* skip unreadable */ }
  return null;
}

/**
 * Extract method/function names from a unified diff.
 * Ruby:  lines starting with `+` followed by `def method_name`
 * TS/JS: lines starting with `+` followed by `export function/const name` or `function name`
 */
function extractChangedMethods(diff: string, file: string): string[] {
  const methods: string[] = [];
  const isRuby = file.endsWith(".rb");

  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;

    if (isRuby) {
      // Match: def method_name  or  def self.method_name
      const m = line.match(/^\+\s*def\s+(?:self\.)?(\w+)/);
      if (m) methods.push(m[1]);
    } else {
      // Match: export function name  /  export const name  /  function name
      const m = line.match(/^\+\s*(?:export\s+)?(?:function|const|let)\s+(\w+)/);
      if (m) methods.push(m[1]);
    }
  }
  return [...new Set(methods)];
}

/**
 * Check which changed methods are covered by the spec file.
 * For Ruby specs: looks for `describe '#method_name'`, `describe '.method_name'`,
 *   or bare method name references in the spec content.
 * For TS/JS tests: looks for import statements, describe blocks, or bare name references.
 * Returns the list of methods that ARE covered.
 */
function specCoveredMethods(specPath: string, methods: string[]): string[] {
  if (methods.length === 0) return [];
  try {
    const content = fs.readFileSync(specPath, "utf8");
    return methods.filter((m) => {
      // RSpec patterns: describe '#method' or describe '.method' or bare reference
      // Vitest patterns: import { method }, describe('method'), test('method'), or bare reference
      return content.includes(m);
    });
  } catch {
    return [];
  }
}

/**
 * Compute coverage score based on changed methods and spec coverage.
 *   no spec file       → 15 pts (maximum penalty)
 *   spec exists, no methods changed → 0 pts (nothing to check)
 *   all methods covered → 0 pts
 *   some methods covered → 4 pts
 *   no methods covered  → 7 pts
 *   spec exists but doesn't reference file at all → 10 pts
 */
function methodCoverageScore(
  hasSpec: boolean,
  specPath: string | null,
  methodsChanged: string[],
  methodsCovered: string[],
  file: string,
): number {
  if (!hasSpec) return 15;
  if (methodsChanged.length === 0) {
    // No methods extracted from the diff — fall back to filename heuristic
    const basename = path.basename(file, path.extname(file));
    try {
      const content = fs.readFileSync(specPath!, "utf8");
      return content.includes(basename) ? 0 : 10;
    } catch {
      return 10;
    }
  }
  if (methodsCovered.length === methodsChanged.length) return 0;
  if (methodsCovered.length > 0) return 4;
  return 7;
}

// ─── Hard flag detection ──────────────────────────────────────────────────────

function hardFlags(file: string, diff: string, hasSpec: boolean): string[] {
  const flags: string[] = [];
  if (file.includes("db/migrate/"))                            flags.push("migration_file");
  if (file.endsWith(".rb") && /authorize!/.test(diff))         flags.push("authorize_changed");
  if (file.endsWith(".rb") && /destroy_all|delete_all/.test(diff)) flags.push("destructive_bulk_op");
  if (file.includes("app/policies/") && !hasSpec)              flags.push("policy_no_spec");
  return flags;
}

const HARD_FLAG_MINIMUMS: Record<string, number> = {
  migration_file:        90,
  authorize_changed:     70,
  destructive_bulk_op:   90,
  policy_no_spec:        70,
};

// ─── Ref range ────────────────────────────────────────────────────────────────

function resolveRefRange(arg?: string): string {
  if (arg) return arg;
  const staged = git(["diff", "--cached", "--name-only"]);
  return staged ? "--cached" : "HEAD~1..HEAD";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const refRange = resolveRefRange(process.argv[2]);
  printSonnetBanner(refRange);
  const files = changedFiles(refRange);

  if (files.length === 0) {
    const empty: RiskReport = {
      ref_range: refRange, files_changed: 0, overall_score: 0,
      overall_risk: "LOW", escalate_to_advisor: false,
      escalation_reason: null, hard_flags_triggered: [], files: [],
    };
    process.stdout.write(JSON.stringify(empty, null, 2) + "\n");
    return;
  }

  const numstat = diffNumstat(refRange);
  const fileRisks: FileRisk[] = [];
  const allFlags: string[] = [];

  for (const file of files) {
    const tier       = resolveTier(file);
    const stats      = numstat.get(file) ?? { added: 0, removed: 0 };
    const churn      = churnIn90Days(file);
    const callSites  = callSiteCount(file);
    const twoHop     = twoHopCallerCount(file);
    const specPath   = findSpec(file);
    const hasSpec    = specPath !== null;
    const diff       = fileDiff(file, refRange);
    const methods    = extractChangedMethods(diff, file);
    const covered    = hasSpec ? specCoveredMethods(specPath!, methods) : [];
    const flags      = hardFlags(file, diff, hasSpec);

    const tScore   = tier.weight;
    // Use the higher signal: actual call sites or 2-hop unique file count
    const effectiveCallers = Math.max(callSites, twoHop);
    const cScore   = callerScore(effectiveCallers);
    const chScore  = churnScore(churn);
    const covScore = methodCoverageScore(hasSpec, specPath, methods, covered, file);

    let score = Math.min(100, tScore + cScore + chScore + covScore);

    // Hard flags enforce minimum scores
    for (const flag of flags) {
      const min = HARD_FLAG_MINIMUMS[flag] ?? 0;
      if (score < min) score = min;
    }

    allFlags.push(...flags);

    fileRisks.push({
      file, tier: tier.name, tier_score: tScore,
      diff: { lines_added: stats.added, lines_removed: stats.removed },
      direct_call_sites: callSites, two_hop_callers: twoHop, caller_score: cScore,
      churn_90d: churn, churn_score: chScore,
      has_spec: hasSpec, spec_path: specPath,
      methods_changed: methods, methods_covered: covered, coverage_score: covScore,
      hard_flags: flags, total_score: score, risk_level: toRiskLevel(score),
    });
  }

  fileRisks.sort((a, b) => b.total_score - a.total_score);

  // Volume-aware aggregation: max file score + bonus for breadth of risk
  const topScore       = fileRisks[0]?.total_score ?? 0;
  const mediumOrAbove  = fileRisks.filter((f) => f.total_score >= 40).length;
  const volumeBonus    = Math.min(10, mediumOrAbove * 2);
  const aggregateScore = Math.min(100, topScore + volumeBonus);
  const overallRisk    = toRiskLevel(aggregateScore);
  const uniqueFlags    = [...new Set(allFlags)];
  const shouldEscalate = overallRisk === "HIGH" || overallRisk === "CRITICAL" || uniqueFlags.length > 0;

  const reasons: string[] = [];
  if (uniqueFlags.includes("migration_file"))      reasons.push("Migration file changed");
  if (uniqueFlags.includes("authorize_changed"))   reasons.push("Authorization boundary (authorize!) changed");
  if (uniqueFlags.includes("destructive_bulk_op")) reasons.push("Destructive bulk operation (destroy_all/delete_all)");
  if (uniqueFlags.includes("policy_no_spec"))      reasons.push("Policy file changed without spec coverage");
  if (reasons.length === 0 && shouldEscalate)      reasons.push(`Overall score ${aggregateScore} ≥ ${overallRisk === "CRITICAL" ? 90 : 70}`);

  const report: RiskReport = {
    ref_range: refRange,
    files_changed: files.length,
    overall_score: aggregateScore,
    overall_risk: overallRisk,
    escalate_to_advisor: shouldEscalate,
    escalation_reason: reasons.length > 0 ? reasons.join("; ") : null,
    hard_flags_triggered: uniqueFlags,
    files: fileRisks,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  if (shouldEscalate) printAdvisorBanner(report);
}

// ─── Model indicator banners ──────────────────────────────────────────────────

// Model → color mapping (must match model-indicator.ts and convention-check.ts)
// opus = red, sonnet = yellow, haiku = green
const BOLD_RED    = "\x1b[1;31m";   // opus   — bold
const BOLD_YELLOW = "\x1b[1;33m";   // sonnet — bold
const BOLD_GREEN  = "\x1b[1;32m";   // haiku  — bold
const DIM_RED     = "\x1b[2;31m";   // opus   — dim
const DIM_YELLOW  = "\x1b[2;33m";   // sonnet — dim
const DIM_GREEN   = "\x1b[2;32m";   // haiku  — dim
const RESET       = "\x1b[0m";

function printSonnetBanner(refRange: string): void {
  process.stderr.write("\n");
  process.stderr.write(`${BOLD_YELLOW}⚑  SONNET EXECUTOR ACTIVE${RESET}\n`);
  process.stderr.write(`${DIM_YELLOW}   running risk-score · ref: ${refRange}${RESET}\n`);
  process.stderr.write("\n");
}

function printAdvisorBanner(report: RiskReport): void {
  process.stderr.write(`${BOLD_RED}⚑  OPUS ADVISOR ESCALATION TRIGGERED${RESET}\n`);
  process.stderr.write(`${DIM_RED}   ${report.overall_risk} (score ${report.overall_score}/100) · ${report.files_changed} files · ${report.escalation_reason}${RESET}\n`);
  process.stderr.write("\n");
}

export function printHaikuBanner(task: string): void {
  process.stderr.write("\n");
  process.stderr.write(`${BOLD_GREEN}⚑  HAIKU EXECUTOR ACTIVE${RESET}\n`);
  process.stderr.write(`${DIM_GREEN}   ${task}${RESET}\n`);
  process.stderr.write("\n");
}

main();
