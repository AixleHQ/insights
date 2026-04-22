/**
 * convention-check.ts — Git convention checker (Haiku task)
 *
 * Checks that the current branch and its commits follow DB90 conventions:
 *   Branch : feature/AIX-XX-short-description  (or hotfix/...)
 *   Commits: [AIX-XX] Short imperative description
 *
 * Output: human-readable pass/fail printed to stdout.
 * Exit 0 always — findings are advisory, reported by /review-commit.
 *
 * Usage: node --experimental-strip-types --no-warnings .claude/scripts/convention-check.ts
 */

import { spawnSync } from "node:child_process";

const GREEN  = "\x1b[1;32m";
const RED    = "\x1b[1;31m";
const YELLOW = "\x1b[1;33m";
const DIM    = "\x1b[2;37m";
const X      = "\x1b[0m";

const BRANCH_RE  = /^(feature|hotfix|chore|fix)\/AIX-\d+-[\w-]+$/;
const COMMIT_RE  = /^\[AIX-\d+\] .+/;

function git(args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return r.stdout?.trim() ?? "";
}

function check(label: string, pass: boolean, detail: string): void {
  const icon  = pass ? `${GREEN}✓${X}` : `${RED}✗${X}`;
  const color = pass ? DIM : YELLOW;
  process.stdout.write(`  ${icon}  ${label}\n`);
  process.stdout.write(`     ${color}${detail}${X}\n`);
}

function main(): void {
  // Haiku banner
  process.stderr.write("\n");
  process.stderr.write(`${GREEN}⚑  HAIKU EXECUTOR ACTIVE${X}\n`);
  process.stderr.write(`${DIM}   convention-check · branch + commit format${X}\n`);
  process.stderr.write("\n");

  const branch  = git(["branch", "--show-current"]);
  const commits = git(["log", "develop..HEAD", "--format=%s"]).split("\n").filter(Boolean);

  process.stdout.write(`\n${DIM}Convention check${X}\n\n`);

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
    process.stdout.write(`  ${DIM}–  No commits ahead of develop${X}\n\n`);
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
      ? `${GREEN}  PASS${X}${DIM} — branch and commits follow DB90 conventions${X}\n\n`
      : `${YELLOW}  WARN${X}${DIM} — fix the items above before pushing${X}\n\n`
  );
}

main();
