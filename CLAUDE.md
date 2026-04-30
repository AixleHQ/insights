# DB90 Rails — Claude Code Guide

> For commands, agents, skills, workflows, and reference docs (Makefile cheatsheet, git conventions, worktree setup), see [AGENTS.md](AGENTS.md).

## Executor / Advisor Pattern

This project uses the [Advisor Strategy](https://claude.com/blog/the-advisor-strategy): Sonnet executes, Opus advises. Default behavior for all substantive work — no per-command wiring.

**Escalate to Opus before proceeding when:**
- Writing or modifying source files that others depend on (components, controllers, migrations, services, policies)
- Making an architectural decision (new pattern, new abstraction, data model change, choosing between approaches)
- A single task touches more than 3 files
- You are uncertain which approach is correct

**How to escalate:**
```
Spawn Agent(model=opus):
  - What you are about to do
  - The key decision point(s)
  - Your proposed approach and any alternatives considered
→ Execute within the guidance returned. Do not deviate without re-escalating.
```

**Do not escalate for:** reference lookups, single-file edits matching an existing pattern, lint/typo fixes, tests matching existing patterns.

## Stack

- Backend: Ruby 3.4.8, Rails 8.1.2 API-only, PostgreSQL 17 + TimescaleDB, RSpec
- Frontend: TypeScript, React 19, Vite, RTL + Vitest
- Full-stack monorepo: `packages/api/` and `packages/web/`. Most features touch both.
- Supporting services (Docker Compose): Redis, Sidekiq, Temporal.io, Keycloak (OIDC), MinIO.

DB90 is an AI tool analytics platform tracking coding-assistant usage (tokens, costs, risk scanning, retention).

**Working directory:** for direct Ruby commands (`bundle exec`, `rails runner`, `rspec`), always run from `packages/api/` — the Gemfile lives there, not the repo root.

## Ruby / Rails Guidelines

- **Linting**: RuboCop with `rubocop-rails-omakase`. Run `bundle exec rubocop --parallel` before commit.
- **Testing**: RSpec + FactoryBot + Faker + Shoulda Matchers. **Do not mock the database** in integration/request specs — use real DB with transactions.
- **Serializers**: Alba (not ActiveModelSerializers or Blueprinter).
- **Authorization**: ActionPolicy (not Pundit or CanCan). Policies in `app/policies/` inherit from `ApplicationPolicy`. Always call `authorize!` at the start of controller actions. Enforced by the `actionpolicy-check` skill.
- **Background jobs**: Sidekiq for standard async jobs (`app/jobs/`). Temporal.io for long-running, multi-step, durable workflows (retries-with-state, human-in-the-loop, cross-service orchestration).
- **API-only**: No views or assets. All rendering is JSON.
- **Swagger is mandatory**: Whenever you add or modify a controller action or route, update `packages/api/swagger/v1/swagger.yaml` in the same commit. Spec must stay in sync with the implementation at all times — new endpoints, changed responses, new query params, removed endpoints. Enforced by the `swagger-sync` skill + `swagger-auditor` agent.

### Application Layer Conventions

The Rails app uses a layered architecture beyond standard MVC:

- `app/domain/` — DDD: entities, value objects, aggregates. Core business logic independent of Rails.
- `app/services/` — Service objects for multi-step operations that don't belong in a single model or controller.
- `app/query_builders/` — Complex ActiveRecord queries. Keep controllers and models free of query logic.
- `app/repositories/` — Data access abstraction, particularly for domain objects.
- `app/policies/` — ActionPolicy authorization policies.

Decision hierarchy: standard Rails patterns first → existing codebase patterns → new patterns (justify explicitly).

## JavaScript / TypeScript Guidelines

- **TypeScript strict mode** — no `any` unless absolutely unavoidable.
- **Component library**: shadcn/ui (Radix UI). Prefer existing components over custom ones.
- **State / data fetching**: TanStack Query (React Query). Do not use raw `fetch` or `axios` in components.
- **Routing**: React Router 7.
- **Testing**: Vitest + React Testing Library. Tests in `packages/web/src/test/` and colocated with components.
- **Formatting** — mandatory, no exceptions:
  - All numeric display must go through `packages/web/src/lib/formatters.ts`. Never use inline `toFixed()`, `toLocaleString()`, or `Intl.NumberFormat` in components or pages.
  - `formatCost(n)` — money/USD. `$0.00` for zero; `$0.0012` (4 dp) for micro-costs < $0.01; `$1,234.56` (2 dp, US locale) otherwise.
  - `formatTokens(n)` — token counts. Exact integer for < 1 000; `125.0K` thousands; `1.2M` millions.
  - New numeric type? Add a named export to `formatters.ts` — never inline at the call site.

## Database

- PostgreSQL 17 with TimescaleDB for time-series.
- Multi-database in production (primary, cache, queue, cable).
- Migrations in `packages/api/db/migrate/`. **Always reversible.**
- Never drop a column in the same migration that removes it from the model — use a two-step deploy.

## Git & Worktree Integrity

**Branch naming:** always branch from `develop` (never `staging` or `main`). Format: `feature/AIX-XX-short-description` (e.g. `feature/AIX-61-user-auth`).

**Commit messages:** `[AIX-XX] Short imperative description` — imperative mood, subject under 72 chars (e.g. `[AIX-58] Add connector health display`).

- Branch from `develop`. Full git conventions also in [AGENTS.md](AGENTS.md#git-conventions).
- **Before every commit, run linters**: `make lint-api` (RuboCop) and/or `make lint-web` (ESLint) for what changed. Errors must be resolved; warnings are acceptable.
- Before opening a PR, verify `gh auth status` succeeds. If not, tell the user instead of failing.
- **Worktree rules** (full setup in [AGENTS.md](AGENTS.md#worktree-setup)):
  - Always `cd` to the main repo directory before cleaning up worktrees (avoids CWD removal).
  - Never run `bundle install` or `npm install` in a worktree — `vendor/` and `node_modules/` are symlinked from the main repo.
  - Docker doesn't follow symlinks outside the build context — replace the symlink with a real copy if running Docker from a worktree.

## Environment

- `.env.example` — copy to `.env` and fill (Google OAuth credentials required).
- `.tool-versions` — use asdf for Ruby and Node.
- Docker Compose manages backing services locally.

## Release secrets

- `NPM_TOKEN` — GitHub Actions repository secret (Settings → Secrets → Actions). Automation token scoped to `@db90/*`, read + write. Rotate every 11 months. Owners: Ada Lovelace + Grace Hopper. Set a calendar reminder on creation.
- npm org `@db90` — both owners must have hardware 2FA enforced at org level.
- To publish: push a tag matching `cli-claude-v*` or `cli-cursor-v*`. See `packages/tools/RELEASING.md` for the full runbook.

## Codebase Exploration

Use Grep, Glob, and Read directly for known files/symbols. Use the Explore subagent for broader open-ended exploration.

## Plans and tasks (in-repo memory bank)

Multi-PR feature plans live in the repo at `plans/` so context survives across Claude sessions and is reviewable in PRs.

**Folder layout** — one folder per epic / feature, named after the epic ticket:

```
plans/
  <feature-slug>-<epic-ticket>/
    plan.md           # master plan: context, locked decisions, critical files, verification
    orientation.md    # conversation context, blockers, do-not-re-litigate decisions
    tasks/
      01-<short-name>.md
      01b-<short-name>.md
      02-<short-name>.md
      ...
```

Example: `plans/npm-distribution-AIX-157/` for the npm distribution epic.

**Conventions:**
- One folder per epic (or large feature). Folder name = `<kebab-feature-name>-<epic-ticket>`.
- `plan.md` and `orientation.md` sit at the top level — they're reference, not execution.
- Numbered files in `tasks/` are sequential execution units. One task = one branch = one PR. `01b-` style suffixes are fine for inserted tasks that don't justify renumbering.
- Each task file is self-contained: scope, prerequisites, files to modify/create, steps, verification, exit criteria.
- Persist the plan to the repo via the **first PR in the stack** (a small commit titled `[<TICKET>] Persist <feature> plan to plans/<feature-slug>-<ticket>/`). Subsequent stacked PRs ride on it; once the first PR merges to `develop`, the plan is permanent.
- Internal cross-references use relative paths (`./tasks/01-…md`, `./plan.md`) so the plan is portable.
- Re-evaluation history goes inside `orientation.md` ("Re-evaluation history" section) so future sessions don't re-litigate decisions.

**Why in-repo:**
- Survives `/clear` and new Claude sessions.
- Reviewable in PRs (each PR description can link `plans/<feature>/tasks/0X-…md` for context).
- Permanent record of the *why*, not just the *what* of large refactors.

For solo / one-shot work that doesn't span multiple PRs, use `~/.claude/plans/` (your local plan folder) instead — those are session-scoped and don't belong in the repo.

### When plan mode kicks in — mandatory artifact

Whenever a developer (or Claude) enters plan mode and the work is expected to span **more than a single small PR**, the plan must be persisted to `plans/<feature-slug>-<ticket>/` **before any implementation begins**. No exceptions for "I'll add it later" — the plan is the contract; without it, the next session can't pick up where this one left off.

**Mandatory before exiting plan mode (for multi-PR work):**
- [ ] `plans/<feature-slug>-<ticket>/plan.md` — master plan with context, locked decisions, critical files, verification.
- [ ] `plans/<feature-slug>-<ticket>/orientation.md` — conversation context, external blockers, do-not-re-litigate decisions.
- [ ] At least the first task file in `plans/<feature-slug>-<ticket>/tasks/` if the plan exceeds 2 sequential steps.
- [ ] First PR in the stack persists these files via a dedicated commit: `[<TICKET>] Persist <feature> plan to plans/<feature-slug>-<ticket>/`.

**When the mandate does NOT apply:**
- Single-line fixes, typos, lint cleanups.
- Single-PR changes where the entire scope fits in one task file's worth of detail (in which case the PR description IS the plan).
- Investigation / spike work where the deliverable is a written analysis, not a code change.

**When uncertain:** err on the side of creating the plan folder. Persisting it costs ~5 minutes; reconstructing intent in a fresh session three weeks later costs an hour.

**Re-entering plan mode on existing work:** if a `plans/<feature>/` folder already exists for the current epic, **read it first** (`orientation.md` → `plan.md` → relevant task files). Update in place rather than starting a parallel plan. Add a "Re-evaluation history" entry to `orientation.md` documenting what changed and why.

### Task sizing — every task must fit Sonnet 4.6 without compaction

The implementation session for any task must fit Sonnet 4.6's 200K context window without forcing compaction. Compaction loses fidelity on locked decisions and degrades quality. Sized tasks let the team default to cheap Sonnet executors.

**Per-task budget** (working set during implementation):

```
~10K  system prompt + tool definitions
~5K   plan.md + orientation.md re-read
~10K  conversation history (turn-over-turn)
~10K  generated code + commit message
~120K active file reads + tool results
─────
~155K total · leaves ~45K headroom from Sonnet's 200K
```

**Plan-time guidelines:**
- ≤ 8-10 files actively modified per task.
- ≤ 500 LOC churn (added + removed) per task.
- ≤ 3 distinct subsystems touched per task (e.g. don't combine `api` + `web` + `infra` into one).
- Self-contained verification — each task's tests must run in isolation.

**Verification — automatic, three layers:**

1. **Claude Code PostToolUse hook** (`.claude/hooks/on-plan-task-edit.ts`) — auto-fires on every Edit/Write to `plans/<feature>/tasks/*.md`. Runs the budget script for the parent feature folder; if any task goes red, the hook fails and surfaces back as a blocker. No-op for non-plan files.
2. **CI job** (`.github/workflows/ci.yml` → `plan_budget_check`) — runs the script across every plan folder on every push. Catches anything that bypassed the local hook (`--no-verify`, edits via non-Claude tools, etc.).
3. **Manual invocation** when you want to spot-check or run before opening a PR:

   ```bash
   node --experimental-strip-types --no-warnings \
     .claude/scripts/plan-task-budget.ts plans/<feature-folder>
   ```

Output is a markdown table classifying each task as ✅ green (≤ 80K), ⚠️ yellow (80–130K), or ❌ red (> 130K). Exit code is non-zero if any red exists.

**If a task comes back red — split it.** Two options, in order of preference:

1. **Split by subsystem into sibling tasks** — if the task touches `api` + `web`, separate them into `0X-api-...md` and `0Y-web-...md`. Each is its own branch and its own PR. Standard "1 task = 1 branch = 1 PR" applies.

2. **Split into sub-tasks on the same branch** — when the task is one logical unit but too large for a single session (e.g. extracting a 1500-LOC service into a new module). Use suffix-letter naming (`02a-...md`, `02b-...md`, `02c-...md`) and ship them on the **same branch** as **one PR with N commits, one per sub-task**. Run `/clear` between sub-task implementation sessions to keep each session fresh on Sonnet. The PR description references all sub-task files for review context.

**Choose option 2 when** the work is one indivisible commit-history story (one feature, one rationale, one rollback unit), but happens to be too big for one Sonnet session. Choose option 1 when the work could ship in independent PRs without coordination overhead.

The plan-task-budget script doesn't distinguish between sub-tasks and standalone tasks — both must fit individually. Sub-tasks share a branch but each must still pass the 130K budget check on its own.

## PR cost footer (advisor/executor accounting)

Every PR ends with a cost footer that compares **three strategies on the same workload**:

- **A. Single Sonnet** — no pattern, no advisor, no model split.
- **B. Single Opus** — no pattern, no advisor, no model split.
- **C. Pattern** — Sonnet (or Opus) executor + N Opus advisor calls.

Two delta lines (C vs A, C vs B) and one bottom-line decision string answer the actual question: **is the advisor/executor pattern worth using on this PR?**

**Generate with:**

```bash
node --experimental-strip-types --no-warnings .claude/scripts/pr-cost-footer.ts \
  --ref develop..HEAD \
  --executor sonnet \
  --advisor-calls 2
```

Flags:
- `--ref` — git range, default `develop..HEAD`. Use `<base-branch>..HEAD` for stacked PRs.
- `--executor` — `sonnet` (default, recommended) or `opus`. Pass what you actually ran, not what was recommended.
- `--advisor-calls` — count of `advisor()` invocations or `Agent(model=opus)` spawns this session. Default 2.

**Append the script's stdout to the PR body** after the test plan.

### How to read the bottom-line decision

The script returns one of three verdicts:

| Verdict | What it means | Lever to pull |
|---|---|---|
| ✅ **pattern is the cheapest option** | Pattern beat both single-Sonnet and single-Opus. Rare; only on huge sessions. | Keep using the pattern. |
| **pattern is a quality premium of $X over single Sonnet** | Pattern adds advisor-call fixed cost on top of executor cost. The $X is what you're paying for the advisor's deeper reasoning. | Keep using the pattern only if those advisor calls prevent rework worth more than $X (typical break-even: an advisor call that catches a logic bug saves > $1.20 in engineering time). |
| ⚠️ **pattern is the most expensive option** | Both levers hurt — Opus executor on a small PR with too many advisor calls. | Switch executor to Sonnet *or* drop advisor calls (or both). |

### What the pattern actually buys

The advisor/executor pattern **does not reduce token cost vs single-Sonnet** for typical PR sizes. Single-Sonnet has the same caching benefit as the pattern's executor; the pattern strictly *adds* the advisor's tokens on top. The pattern is a **quality strategy** — Opus's deeper reasoning on architectural / security-sensitive moments is the value, not raw cost reduction.

The pattern *does* reduce cost vs single-Opus, because the Sonnet executor is 5× cheaper per token. So:

- If you'd reach for Opus anyway → pattern saves money (use it).
- If you'd reach for Sonnet anyway → pattern adds quality at a per-PR premium (use it only on PRs where decision quality matters: architectural changes, security-sensitive code, ambiguous specs, large refactors).

### Aggregate signal

Track the bottom-line verdict across PRs over time:
- ✅ trending across many small PRs → genuine pattern wins; team is using it well.
- "quality premium" trending → pattern is being used for quality on routine work; check whether advisor calls are catching real issues in review.
- ⚠️ trending → pattern is being applied to PRs that don't need it; nudge default-Sonnet, fewer advisor calls.

Estimates are heuristic (±50%), based on git diff size + standard model rates. The point is the *ratio*, not exact billing.
