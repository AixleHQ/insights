/**
 * risk-score.ts — Deterministic risk scoring for /review-changes
 *
 * Collects signals from git and the filesystem, computes a weighted risk score
 * per changed file, and outputs a structured RiskReport JSON to stdout.
 *
 * Signals used (in order of weight):
 *   1. File-path tier  (0–40 pts) — where in the architecture the file lives
 *   2. Caller count    (0–30 pts) — direct callers via `git grep`
 *   3. Churn rate      (0–15 pts) — commits in last 90 days
 *   4. Test coverage   (0–15 pts) — spec file presence + method match heuristic
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
  direct_callers: number;
  caller_score: number;
  churn_90d: number;
  churn_score: number;
  has_spec: boolean;
  spec_path: string | null;
  spec_has_method_match: boolean;
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

function coverageScore(hasSpec: boolean, hasMethodMatch: boolean): number {
  if (!hasSpec)         return 15;
  if (!hasMethodMatch)  return 7;
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
 * Count files in the codebase that reference the given symbol name.
 * Uses `git grep -l` which is cross-platform (no grep/rg dependency).
 * Excludes the defining file itself.
 */
function callerCount(file: string): number {
  const ext = path.extname(file);
  const symbol = path.basename(file, ext);
  const isRuby = ext === ".rb";

  const searchPath = isRuby ? "packages/api/app" : "packages/web/src";
  const glob = isRuby ? "*.rb" : "*.{ts,tsx}";

  const r = spawnSync(
    "git",
    ["grep", "-l", "--", symbol, `${searchPath}/**/${glob}`],
    { cwd: projectDir, encoding: "utf8" }
  );

  const matches = (r.stdout ?? "").split("\n").filter(Boolean);
  // Subtract 1 if the file itself appears (it defines the symbol)
  const selfCount = matches.filter((m) => m.endsWith(file)).length;
  return Math.max(0, matches.length - selfCount);
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

/** Heuristic: does the spec reference the module/class name at least once? */
function specCoversFile(specPath: string, file: string): boolean {
  const basename = path.basename(file, path.extname(file));
  try {
    const content = fs.readFileSync(specPath, "utf8");
    return content.includes(basename);
  } catch {
    return false;
  }
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
    const tier     = resolveTier(file);
    const stats    = numstat.get(file) ?? { added: 0, removed: 0 };
    const churn    = churnIn90Days(file);
    const callers  = callerCount(file);
    const specPath = findSpec(file);
    const hasSpec  = specPath !== null;
    const hasMatch = hasSpec ? specCoversFile(specPath!, file) : false;
    const diff     = fileDiff(file, refRange);
    const flags    = hardFlags(file, diff, hasSpec);

    const tScore   = tier.weight;
    const cScore   = callerScore(callers);
    const chScore  = churnScore(churn);
    const covScore = coverageScore(hasSpec, hasMatch);

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
      direct_callers: callers, caller_score: cScore,
      churn_90d: churn, churn_score: chScore,
      has_spec: hasSpec, spec_path: specPath,
      spec_has_method_match: hasMatch, coverage_score: covScore,
      hard_flags: flags, total_score: score, risk_level: toRiskLevel(score),
    });
  }

  fileRisks.sort((a, b) => b.total_score - a.total_score);

  const topScore    = fileRisks[0]?.total_score ?? 0;
  const overallRisk = toRiskLevel(topScore);
  const uniqueFlags = [...new Set(allFlags)];
  const shouldEscalate = overallRisk === "HIGH" || overallRisk === "CRITICAL" || uniqueFlags.length > 0;

  const reasons: string[] = [];
  if (uniqueFlags.includes("migration_file"))      reasons.push("Migration file changed");
  if (uniqueFlags.includes("authorize_changed"))   reasons.push("Authorization boundary (authorize!) changed");
  if (uniqueFlags.includes("destructive_bulk_op")) reasons.push("Destructive bulk operation (destroy_all/delete_all)");
  if (uniqueFlags.includes("policy_no_spec"))      reasons.push("Policy file changed without spec coverage");
  if (reasons.length === 0 && shouldEscalate)      reasons.push(`Overall score ${topScore} ≥ ${overallRisk === "CRITICAL" ? 90 : 70}`);

  const report: RiskReport = {
    ref_range: refRange,
    files_changed: files.length,
    overall_score: topScore,
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

const RED    = "\x1b[1;31m";   // bold red    — opus
const ORANGE = "\x1b[1;33m";   // bold yellow — sonnet (closest ANSI to orange)
const GREEN  = "\x1b[1;32m";   // bold green  — haiku
const DIM    = "\x1b[2;37m";   // dim white
const RESET  = "\x1b[0m";

function printSonnetBanner(refRange: string): void {
  process.stderr.write("\n");
  process.stderr.write(`${ORANGE}⚑  SONNET EXECUTOR ACTIVE${RESET}\n`);
  process.stderr.write(`${DIM}   running risk-score · ref: ${refRange}${RESET}\n`);
  process.stderr.write("\n");
}

function printAdvisorBanner(report: RiskReport): void {
  process.stderr.write(`${RED}⚑  OPUS ADVISOR ESCALATION TRIGGERED${RESET}\n`);
  process.stderr.write(`${DIM}   ${report.overall_risk} (score ${report.overall_score}/100) · ${report.files_changed} files · ${report.escalation_reason}${RESET}\n`);
  process.stderr.write("\n");
}

// haiku indicator — not yet wired to a task; available for lightweight commands
export function printHaikuBanner(task: string): void {
  process.stderr.write("\n");
  process.stderr.write(`${GREEN}⚑  HAIKU EXECUTOR ACTIVE${RESET}\n`);
  process.stderr.write(`${DIM}   ${task}${RESET}\n`);
  process.stderr.write("\n");
}

main();
