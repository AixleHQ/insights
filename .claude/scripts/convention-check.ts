/**
 * convention-check.ts — Git convention checker
 *
 * Checks that the current branch and its commits follow Aixle Insights conventions:
 *   Branch : feature/AIX-XX-short-description  (or hotfix/...)
 *   Commits: [AIX-XX] Short imperative description
 *
 * Output: human-readable pass/fail printed to stdout.
 * Exit 0 always — findings are advisory, reported by /review-commit.
 *
 * Usage: node --experimental-strip-types --no-warnings .claude/scripts/convention-check.ts
 */

import { spawnSync } from "node:child_process";

const BOLD_GREEN = "\x1b[1;32m";
const DIM_GREEN  = "\x1b[2;32m";
const BOLD_WHITE = "\x1b[1;37m";
const DIM_WHITE  = "\x1b[2;37m";
const X          = "\x1b[0m";

const BRANCH_RE  = /^(feature|hotfix|chore|fix)\/AIX-\d+-[\w-]+$/;
const COMMIT_RE  = /^\[AIX-\d+\] .+/;

function git(args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return r.stdout?.trim() ?? "";
}

function check(label: string, pass: boolean, detail: string): void {
  const icon  = pass ? `${BOLD_GREEN}✓${X}` : `${BOLD_WHITE}✗${X}`;
  const color = pass ? DIM_GREEN : DIM_WHITE;
  process.stdout.write(`  ${icon}  ${label}\n`);
  process.stdout.write(`     ${color}${detail}${X}\n`);
}

function main(): void {
  const branch  = git(["branch", "--show-current"]);
  const commits = git(["log", "develop..HEAD", "--format=%s"]).split("\n").filter(Boolean);

  process.stdout.write(`\n${DIM_WHITE}Convention check${X}\n\n`);

  // Branch name
  const branchOk = BRANCH_RE.test(branch);
  check(
    "Branch name",
    branchOk,
    branchOk
      ? `${branch}`
      : `"${branch}" — expected feature/AIX-XX-short-description`
  );

  // Commit messages
  if (commits.length === 0) {
    process.stdout.write(`  ${DIM_WHITE}–  No commits ahead of develop${X}\n\n`);
    return;
  }

  let allOk = true;
  for (const msg of commits) {
    const ok = COMMIT_RE.test(msg);
    if (!ok) allOk = false;
    check(
      "Commit message",
      ok,
      ok ? msg : `"${msg}" — expected [AIX-XX] Imperative description`
    );
  }

  process.stdout.write("\n");

  const overall = branchOk && allOk;
  process.stdout.write(
    overall
      ? `${BOLD_GREEN}  PASS${X}${DIM_GREEN} — branch and commits follow Aixle Insights conventions${X}\n\n`
      : `${BOLD_WHITE}  WARN${X}${DIM_WHITE} — fix the items above before pushing${X}\n\n`
  );
}

main();
