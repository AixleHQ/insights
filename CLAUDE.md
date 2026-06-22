# DB90 Rails — Claude Code Guide

> For commands, agents, skills, workflows, and reference docs (Makefile cheatsheet, git conventions, worktree setup), see [AGENTS.md](AGENTS.md).

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

**Branch naming:** always branch from `develop` (never `staging` or `main`). Format: `<prefix>/AIX-XX-short-description`. Prefixes: `feature/` for new functionality, `bugfix/` for bug fixes (e.g. `feature/AIX-61-user-auth`, `bugfix/AIX-319-google-sign-in`).

**Commit messages:** Conventional Commits are mandatory. Format: `<type>(<scope>): [AIX-XX] short imperative description`. Subject under 72 chars.

Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`. Scope is optional but encouraged for package-scoped changes (e.g. `api`, `web`, `aixle-insights`, `temporal-worker`).

Examples:
- `feat(api): [AIX-184] Add project route guard and token refresh`
- `fix(aixle-insights): [AIX-338] Pass resolved path to sqlite open helper`

The `[AIX-XX]` ticket prefix is required in the subject (not the footer). Conventional Commits enable automated CHANGELOG generation and clear release notes.

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

- npm org `@aixle` — owned by `aixle-bot` (service account, email `aixle@example.com`). All maintainers must have hardware 2FA (FIDO2/WebAuthn — passkey or YubiKey) enforced.
- **No `NPM_TOKEN`** — publishing uses **OIDC Trusted Publishing** (GitHub Actions OIDC). No long-lived token is stored in GitHub Secrets.
- **Provenance attestation is deferred** — npm rejects provenance bundles from private source repos (HTTP 422 "Unsupported GitHub Actions source repository visibility: private"). `publishConfig.provenance` is explicitly `false` until this repo is made public; flip to `true` in the same PR that flips visibility. Registry-level signatures (`npm audit signatures`) remain in place; the rest of the supply-chain hardening (OIDC, hardware 2FA, `--ignore-scripts`) is unaffected.
- To publish: push a tag matching **`cli-mcp-v*`** → approve the `npm-publish` GitHub Environment gate. See `packages/tools/RELEASING.md` for the full runbook.
- **Break-glass only:** if OIDC fails at npm Inc.'s side, create a Granular Access Token (90-day max) scoped to `@aixle/insights`. Delete it immediately after the publish. Never store permanently.
- Plan and threat-model for this setup: `plans/npm-org-setup-aixle/` (orientation, tasks 01–05).

## Codebase Exploration

Use Grep, Glob, and Read directly for known files/symbols. Use the Explore subagent for broader open-ended exploration.

## Architecture Reference Documents

- Package-level ARDs (for example, `packages/tools/aixle-insights/ARD.md`) are living architecture references.
- When a change alters package architecture, runtime layers, data flow, security boundaries, release/verification architecture, or major design decisions, update the relevant `ARD.md` in the same PR.
- If an architecture change introduces a new package or subsystem without an ARD, create one near that subsystem and link it from the package README when useful.

## Jira ticket discipline — MANDATORY

**Before suggesting that a new Jira ticket be created (or calling `createJiraIssue`), you MUST first search Jira via the Atlassian MCP to verify no existing ticket already covers the work.**

This rule is non-negotiable. The team files tickets ahead of code — most "discoveries" mid-PR are already on the board. Filing a duplicate wastes triage time and fragments the conversation across two issues.

**Required steps before proposing or filing:**

1. **Search Jira** via `mcp__…__searchJiraIssuesUsingJql` with keywords from the finding. Start broad (`text ~ "<topic>"`), narrow if too noisy. Filter by `statusCategory != Done` to see live work.
2. **Check sub-tasks of the parent ticket** (the bug or epic the current PR addresses) — the gap may already be tracked as a sub-task you haven't seen.
3. **Only file a new ticket** if no existing one fits. When you do file, link the parent ticket (or related context) so triage understands the lineage.

**If you find an existing ticket:** link to it in the PR description or comment, and update its status/description if your discovery adds material context. Don't duplicate.

**If JQL results exceed the MCP token limit:** save the JSON output (the tool surfaces a file path on overflow) and use `jq` to extract just `key + summary + status` before reasoning over it.

Searches should be cheap — they run in the same turn as the discovery. There is no acceptable shortcut around this rule, even under time pressure.

## Plans and tasks (in-repo memory bank)

Multi-PR feature plans live in the repo at `plans/` so context survives across Claude sessions and is reviewable in PRs.

**Superpowers plugin override:** the `writing-plans` and `brainstorming` skills default to `docs/superpowers/plans/` and `docs/superpowers/specs/`. In this project, save all plans and specs under `plans/<feature-slug>-<ticket>/` per the layout below — not under `docs/`.

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

**After completing implementation work on a task:** append a `## Session Record` section to the bottom of the active task file before committing or opening a PR. Include: files changed (from `git diff develop..HEAD --name-only`), what was implemented (from commit messages), deferred/out-of-scope items (unchecked `- [ ]` items in the task file), and any tradeoffs made. This is the lightweight post-session record that makes multi-session features coherent across `/clear` and new conversations.

### Task sizing — every task must fit Sonnet 4.6 without compaction

The implementation session for any task must fit Sonnet 4.6's 200K context window without forcing compaction. Compaction loses fidelity on locked decisions and degrades quality.

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

1. **Split into sub-tasks on the same branch** — use suffix-letter naming (`01a-...md`, `01b-...md`, `02a-...md`, `02b-...md`, etc.) and ship all sub-tasks on the **same branch** as **one PR with N commits, one per sub-task**. Run `/clear` between sub-task implementation sessions to keep each session fresh on Sonnet. The PR description references all sub-task files for review context. This is the default split strategy — **keep all work for a ticket in a single PR**, even when it spans `api` + `web` subsystems.

2. **Split by subsystem into sibling tasks (separate PRs)** — only when the subsystem pieces are genuinely independent and could ship to production on different timelines (e.g., a standalone API change that unblocks another team). If the feature only makes sense when both sides ship together, stay on one branch.

**Default: one ticket = one PR.** Use option 2 only when there is a concrete reason to ship subsystems separately.

The plan-task-budget script doesn't distinguish between sub-tasks and standalone tasks — both must fit individually. Sub-tasks share a branch but each must still pass the 130K budget check on its own.
