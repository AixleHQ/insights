# DB90 Claude Tooling — Agents, Skills, Commands & Hooks

This file is the authoritative reference for all Claude Code automation in this repo. There are four primitive types:

- **Commands** (`/name`) — explicit slash commands you invoke in the conversation. They orchestrate workflows, may spawn agents, and return a report.
- **Agents** — autonomous subagents spawned by the model. They run isolated, have their own tool allowlists, and produce structured reports. You never invoke them by name — they fire based on context.
- **Skills** — context fragments auto-loaded by the harness when you edit specific file patterns. They inject rules and reminders into Claude's context before it acts, but do not block execution.
- **Hooks** — shell commands registered in `.claude/settings.json` that run automatically on harness events (e.g., every file edit). They run outside Claude's context.

`DB90_COACHING=true` (default) appends one-line coaching trailers to agent output explaining why they fired and what to read next. Silence with `DB90_COACHING=false` in `.claude/settings.local.json`.

Run `/help-tooling` at any time for a live, filesystem-sourced catalog.

---

## Executor / Advisor Pattern

This project uses the **Advisor Strategy**: Sonnet executes, Opus advises. This is a standing rule in `CLAUDE.md` — it applies to all sessions automatically, not just specific commands.

**When Sonnet must escalate to Opus before proceeding:**
- Writing or modifying source files that others depend on (components, controllers, migrations, services, policies)
- Making an architectural decision (new pattern, new abstraction, data model change, choosing between approaches)
- A single task touches more than 3 files
- Genuine uncertainty about which approach is correct

**How escalation works:**
```
Agent(model=opus): what you're about to do, key decision points, proposed approach
→ Execute within the guidance returned. Do not deviate without re-escalating.
```

**Do not escalate for:** reference lookups, single-file edits following an established pattern, lint fixes, typo corrections, test additions matching existing patterns, or commands explicitly marked as reference-only (no file writes).

The `component-builder` agent is the clearest example of this pattern in action — it has hard-coded tripwires that pause execution and call an Opus advisor before writing any substantive change.

---

## Quick Reference

| Name | Type | Activates when | Purpose |
|------|------|----------------|---------|
| `backend-reviewer` | Agent | Any `.rb` diff detected | Reviews Ruby/Rails changes for DB90 conventions — serializers, authorization, architecture, migrations, testing |
| `component-builder` | Agent | Spawned by `/migrate-component` only | Writes Figma-driven shadcn/Radix UI components; stops at hard-coded tripwires to call component-reviewer |
| `component-reviewer` | Agent | After component-builder tripwires fire; after build; on `components/ui/` diffs | Soft-gate review: design tokens, dark mode, a11y, TypeScript — reports findings, never modifies code |
| `swagger-auditor` | Agent | Controller or `routes.rb` file changes | Hard-gate PASS/FAIL: verifies `swagger.yaml` matches every controller/route change in the same commit |
| `ui-visual-reviewer` | Agent | After `component-reviewer` passes; on `.tsx` UI diffs in `/review-commit` | Screenshots in light + dark via Playwright; checks visual accuracy, dark mode, interactive states, regressions |
| `/migrate-component` | Command | `/migrate-component <ComponentName>` | Full Figma → code pipeline: reads Figma, diffs implementation, delegates to component-builder → component-reviewer → ui-visual-reviewer |
| `/implement-design` | Command | `/implement-design <figma-url>` | 7-step workflow: fetch Figma design → download assets → implement in project conventions → validate visual parity |
| `/tailwind-v4-shadcn` | Command | `/tailwind-v4-shadcn` | Reference guide for Tailwind v4 + shadcn/ui setup and v4 migration pitfalls |
| `/review-architecture` | Command | `/review-architecture` | Deep architectural review (Staff Engineer lens): maintainability, security, performance across backend and frontend |
| `/review-commit` | Command | `/review-commit` | Pre-push gate: Step 0 runs `convention-check.ts` (branch + commit format); then linters, tests, swagger-auditor, ui-visual-reviewer; reports READY TO PUSH or BLOCK |
| `/review-changes` | Command | `/review-changes` | Risk-scored review via `risk-score.ts`: weighted score per file (tier + callers + churn + spec) → Opus advisor if HIGH/CRITICAL |
| `/typescript-react-reviewer` | Command | `/typescript-react-reviewer` | TypeScript + React 19 specific review: critical bugs, anti-patterns, strict TS, React 19 pitfalls |
| `/debug-issue` | Command | `/debug-issue` | Systematic debugging: grep for symbols → trace call sites → read files → check recent commits → find test coverage |
| `/explore-codebase` | Command | `/explore-codebase` | Codebase navigation using Glob for file discovery, Grep for symbols, Read for file content |
| `/playwright-cli` | Command | `/playwright-cli` | CLI reference for 40+ Playwright browser automation commands |
| `/playwright-best-practices` | Command | `/playwright-best-practices` | 50+ Playwright testing patterns: E2E, component, API, auth, mobile, CI/CD |
| `/postgresql-table-design` | Command | `/postgresql-table-design` | Schema design reference: data types, constraints, indexing, partitioning, TimescaleDB, JSONB, safe evolution |
| `/postgresql-optimization` | Command | `/postgresql-optimization` | Query optimization reference: EXPLAIN ANALYZE, index strategies, window functions, full-text search, monitoring |
| `/manage-worktrees` | Command | `/manage-worktrees <action>` | Create, navigate, and clean up git worktrees for parallel ticket development |
| `/refactor-plan` | Command | `/refactor-plan` | Safe refactoring: dead code detection, rename planning, impact radius, dependency analysis |
| `/onboard` | Command | `/onboard` | Guided 10-minute walkthrough of DB90 Claude tooling — 4 exercises for new engineers |
| `/tanstack-query-best-practices` | Command | `/tanstack-query-best-practices` | 32 TanStack Query v5 rules: query keys, caching, mutations, error handling, prefetching, performance |
| `/discover-skills` | Command | `/discover-skills` | Scans project stack, queries skill registry, evaluates and installs relevant skills |
| `/help-tooling` | Command | `/help-tooling [filter]` | Live filesystem-sourced catalog of all tooling with when-to-use guidance |
| `swagger-sync` | Skill | Edit `controllers/**` or `routes.rb` | Injects the Swagger hard-rule: update `swagger.yaml` in the same commit |
| `actionpolicy-check` | Skill | Edit any `*_controller.rb` | Injects the `authorize!` requirement at the top of every controller action |
| `design-system-guide` | Skill | Edit `packages/web/src/components/ui/**` | Injects token rules (no raw hex), dark mode parity, a11y requirements, Figma MCP hooks |
| `on-edit-lint` | Hook | Every `Edit` or `Write` tool call | Prints green Haiku banner; runs `bundle exec rubocop` on `.rb` files; `npx eslint` on `.ts/.tsx` files — advisory, always exits 0 |
| `model-indicator` | Hook | Every `Agent` tool call (PreToolUse) | Prints colored model banner to stderr: red = Opus advisor, orange = Sonnet executor, green = Haiku executor |

---

## Agents

Agents are autonomous subagents spawned by the model (via Claude Code's Task tool). They run in an isolated context, have their own tool allowlists, and produce structured reports. You do not invoke them directly.

### `backend-reviewer`

**Role:** Reviewer — soft gate. Reports findings, never modifies code.  
**Model:** Sonnet  
**Triggers:** Auto-spawned when a `.rb` file diff is detected — during `/review-commit`, `/review-architecture`, or when the model detects a backend change. Always runs alongside `swagger-auditor` when the diff includes controllers or routes.  
**Tools:** Read, Grep, Glob, Bash

**What it enforces:**

- **Serializers:** Alba only. Flags `ActiveModel::Serializer`, `Blueprinter::Base`, JBuilder.
- **Authorization:** ActionPolicy only. `authorize!` must appear at the top of every controller action. Flags Pundit and CanCan.
- **Layered architecture:** Business logic must be in the right layer:
  - `app/domain/` — DDD entities, value objects, core business logic independent of Rails
  - `app/services/` — multi-step operations that span models or require coordination
  - `app/query_builders/` — complex ActiveRecord queries (keep controllers and models query-free)
  - `app/repositories/` — data access abstraction for domain objects
  - `app/policies/` — ActionPolicy policies only, all inheriting from `ApplicationPolicy`
- **Background jobs:** Sidekiq for standard async. Temporal.io for long-running, multi-step, or durable workflows.
- **Migrations:** Must be reversible. Never drop a column in the same migration that removes it from the model (two-step deploy).
- **Testing:** RSpec + FactoryBot + Faker + Shoulda Matchers. Integration/request specs must use a real database — no mocked DB.
- **Linting:** `bundle exec rubocop --parallel` must pass.

**Output:**
```
## Backend review
### Blockers
- [file:line] Description — one-sentence fix
### Issues
- ...
### Nits
- ...
Verdict: APPROVED | APPROVED WITH SUGGESTIONS | CHANGES REQUESTED
```
Max 15 bullets total. Every finding cites file and line.

---

### `component-builder`

**Role:** Executor — the only agent in the stack that writes files.  
**Model:** Sonnet  
**Triggers:** Spawned only by `/migrate-component`. Do not invoke directly for routine edits.  
**Tools:** Read, Write, Edit, Bash, Glob, Grep

**What it does:**
1. Reads Figma design context (variants, props, tokens, slot structure, light/dark differences) via Figma MCP
2. Reads the current implementation from `packages/web/src/components/ui/<ComponentName>.tsx`
3. Lists all consumers using Grep
4. Checks hard-coded escalation tripwires — stops and calls `component-reviewer` before writing if any fire
5. Writes the component following shadcn/Radix patterns
6. Checks tripwires again before declaring done

**Hard-coded escalation tripwires** — any one fires → pause and call `component-reviewer` first:
1. Introducing a variant not present in the current implementation
2. Using a new Radix UI primitive (new shadcn/Radix composition)
3. Migration touches more than 3 files
4. Needs a new CSS variable not already in `packages/web/src/index.css`
5. A consumer component has more than 5 usages

**Design conventions enforced:**
- Design tokens only (CSS custom properties) — no raw hex, no arbitrary Tailwind
- Dark mode parity for every variant
- Radix UI primitives for all interactive elements
- `cva` for variant composition
- TypeScript strict — no `any`, props interface exported as `<ComponentName>Props`

**Output:**
```
## component-builder result
- Variants written: [list]
- Design tokens used: [list]
- Dark mode: VERIFIED | MISSING [list]
- Consumers affected: [count] ([list])
- Tripwires fired: [none | list]
- Reviewer calls: [none | list of outcomes]
- Files modified: [list]
```

---

### `component-reviewer`

**Role:** Reviewer — soft gate. Reports findings, never modifies code.  
**Model:** Sonnet  
**Triggers:** Spawned (a) when `component-builder` tripwires fire, (b) by `/migrate-component` after the build completes, (c) when `components/ui/` files change directly.  
**Tools:** Read, Grep, Glob, Bash

**What it checks:**

- **Design tokens:** All colours, spacing, surfaces must use CSS custom properties from `index.css`. No raw hex, no Tailwind palette colours, no arbitrary values.
- **Dark mode parity:** Every variant must render correctly in both themes. `dark:` prefix overrides must have light-mode counterparts. Checks `:root` and `.dark` scopes in `index.css`.
- **Radix composition:** Interactive elements must use the corresponding Radix UI primitive — no roll-your-own implementations.
- **Accessibility:** Buttons have visible text or `aria-label`. Inputs have `<label>` or `aria-labelledby`. Icon-only elements have `aria-hidden="true"` with a labelled parent. All interactive elements keyboard-reachable.
- **TypeScript:** No `any`. Props interface exported as `<ComponentName>Props`. `cva` variant types exported.

**Output:** Blockers / Issues / Nits (max 15 bullets) + Verdict — same structure as `backend-reviewer`.

---

### `swagger-auditor`

**Role:** Auditor — hard gate. Returns PASS or FAIL only. No advisory mode, no nits.  
**Model:** Haiku (cheap, deterministic pattern matching)  
**Triggers:** Spawned whenever controllers or `routes.rb` change — during `/review-commit` or detected automatically. Always runs alongside `backend-reviewer` on controller diffs.  
**Tools:** Read, Grep, Bash

**What it checks:**  
Every added/removed/changed controller action and route must have a matching change in `packages/api/swagger/v1/swagger.yaml` in the same commit. Checks: paths, HTTP methods, parameters, response schemas.

**Output:**
```
## Swagger audit
Status: PASS
```
or
```
## Swagger audit
Status: FAIL
Required changes:
- packages/api/swagger/v1/swagger.yaml: add POST /api/v1/users
  (added in UsersController#create at controllers/users_controller.rb:14)
```
If no controllers or routes changed: `Status: PASS — no controller/route changes in diff.`

---

### `ui-visual-reviewer`

**Role:** Reviewer — visual accuracy gate. Never modifies code.  
**Model:** Sonnet  
**Triggers:** (a) After `component-reviewer` passes in the `/migrate-component` pipeline. (b) From `/review-commit` when `.tsx` files under `packages/web/src/` are in the diff.  
**Tools:** Read, Bash, Glob

**Tool priority:**
1. **Playwright headless** (preferred) — deterministic, uses `packages/web/playwright.config.ts`
2. **Claude_Preview** (fallback) — inline visual checks when Playwright unavailable
3. **Claude_in_Chrome** — manual investigation only; never used as an enforcement layer

**What it checks:** Correct design token colours in light/dark, spacing and typography, dark mode adaptation, all `cva` variants, interactive states (hover, focus, disabled), responsive layout, feature behavior.

**Output:**
```
## Visual review
### Light theme
- [PASS/FAIL] [finding]
### Dark theme
- [PASS/FAIL] [finding]
### Regressions
- [none | list]
Verdict: PASS | FAIL
```

---

## Commands

Commands are invoked manually with `/command-name`. They run in the main conversation and may spawn agents as subagents.

### Design System

**`/migrate-component <ComponentName>`**  
Orchestrates the full Figma → code pipeline for a single UI component.  
**Spawns:** Figma MCP → `component-builder` → `component-reviewer` → `ui-visual-reviewer`  
**Deliverable:** Updated component files with a final visual review report. Pipeline pauses at `component-builder` tripwires for advisor input before writing.

**`/implement-design <figma-url>`**  
Translates any Figma node into production-ready code with 1:1 visual parity, outside the component library pipeline.  
**Steps:** Get node ID → fetch design context → capture visual reference → download assets → implement → validate parity  
**Deliverable:** New or modified files matching the Figma design, plus a parity validation report.

**`/tailwind-v4-shadcn`**  
Reference guide for Tailwind v4 + shadcn/ui configuration and v4 migration pitfalls (`@theme` directive, deprecated plugins, CSS variable syntax, `tailwindcss-animate` replacement).  
**Deliverable:** Inline reference with code examples — no files written.

---

### Code Review

**`/review-commit`**  
Pre-push gate — run this before every `git push`.  
**Runs:** RuboCop, Brakeman, ESLint, TypeScript typecheck, RSpec, Vitest in parallel.  
**Spawns:** `swagger-auditor` + `backend-reviewer` if controllers/routes changed; `ui-visual-reviewer` if `.tsx` UI files changed.  
**Deliverable:** **READY TO PUSH** or **BLOCK** with categorized findings and required actions.

**`/review-architecture`**  
Deep architectural review of all changes since `develop`, through the lens of maintainability, security, and performance.  
**Spawns:** `backend-reviewer` + `swagger-auditor` on backend diffs; checks React 19 patterns and TypeScript quality on frontend diffs.  
**Deliverable:** CRITICAL/HIGH/MEDIUM/LOW findings with Verdict. More thorough than `/review-commit` — use before significant PRs.

**`/review-changes`**  
Deterministic risk-scored review powered by `.claude/scripts/risk-score.ts`.  
**Steps:** run scorer (tier + caller count + 90d churn + spec coverage) → escalate to Opus if HIGH/CRITICAL or hard flag fires → read diff → write report  
**Hard flags:** migration file, authorize! change, destroy_all/delete_all, policy with no spec — always force HIGH or CRITICAL regardless of score.  
**Deliverable:** Per-file score breakdown + grouped findings (CRITICAL/HIGH/MEDIUM/LOW) + merge verdict.

**`/typescript-react-reviewer`**  
TypeScript + React 19 specific review: critical bugs, anti-patterns, strict TS violations.  
**Catches:** `useEffect` for derived state, missing cleanup, direct state mutation, conditional hooks, `key={index}`, `any` without justification, `useFormStatus` misuse, promises in render, React 19-specific mistakes.  
**Deliverable:** Priority-ordered findings (Critical → High → Architecture/Style).

---

### Debugging & Exploration

**`/debug-issue`**  
Systematic debugging using native search tools.  
**Steps:** Grep for symbols → trace call sites → Read files → check recent commits → find test coverage  
**Deliverable:** Root cause hypothesis with specific file/line references and suggested fix.

**`/explore-codebase`**  
Navigate codebase structure using Glob, Grep, and Read.  
**Steps:** Glob for file layout → Grep for symbols → Read key files → trace imports  
**Deliverable:** Structural map or targeted answer.

**`/playwright-cli`**  
CLI reference for 40+ Playwright browser automation commands (navigation, interaction, screenshots, tabs, cookies, network mocking, DevTools).  
**Deliverable:** Inline code examples — no files written.

**`/playwright-best-practices`**  
50+ Playwright testing patterns organized by activity (E2E, component, API, auth, mobile, CI/CD). Includes DB90-specific auth setup and test command references.  
**Deliverable:** Inline reference — no files written.

---

### Database

**`/postgresql-table-design`**  
Schema design reference for PostgreSQL 17 + TimescaleDB: data types, constraints, indexing, partitioning, JSONB patterns, hypertables, safe schema evolution (two-step deploys).  
**Deliverable:** Inline reference with code examples — no files written.

**`/postgresql-optimization`**  
Query optimization reference: `EXPLAIN ANALYZE` with `BUFFERS`, `pg_stat_statements`, composite/partial/expression/covering/GIN/BRIN indexes, window functions, full-text search, TimescaleDB-specific optimization.  
**Deliverable:** Inline reference with code examples — no files written.

---

### Workflow & Reference

**`/manage-worktrees <action>`**  
Create, navigate, list, and clean up git worktrees for parallel ticket development. Handles branch creation from `develop`, directory naming (`../db90-rails-AIX-XX`), and `vendor/` + `node_modules/` symlinking.  
**Deliverable (create):** Worktree at `~/db90-rails-AIX-XX/` on branch `feature/AIX-XX-<description>`. **Deliverable (clean up):** Directory removed, branch deleted.

**`/refactor-plan`**  
Plan and execute safe refactoring using dependency analysis.  
**Steps:** Grep for all usages → Glob affected module → Read implementation → list call sites → verify with Grep after changes.  
**Deliverable:** Refactor plan with risk assessment; optionally applied changes.

**`/onboard`**  
Guided 10-minute walkthrough for engineers new to the project — 4 exercises that observe every primitive type firing live.  
**Deliverable:** Hands-on understanding of all primitive types (see Workflow E below).

**`/tanstack-query-best-practices`**  
32 TanStack Query v5 rules: query keys (5), caching (5), mutations (6), error handling (3), prefetching (4), parallel queries (2), infinite queries (3), performance (4), offline support (2). Includes v5-specific changes (`isLoading → isPending`, `cacheTime → gcTime`).  
**Deliverable:** Inline reference — no files written.

**`/discover-skills`**  
Scans project stack, queries the skill registry, evaluates candidates against 3 gates (context safety, trigger scope, additive value), and installs approved skills.  
**Deliverable:** Newly installed skill files or evaluation report of rejected candidates.

**`/help-tooling [filter]`**  
Live filesystem-sourced catalog of all tooling. Reads directly from `.claude/` — never drifts from what's actually installed.  
**Usage:** `/help-tooling` or `/help-tooling backend` or `/help-tooling design system`  
**Deliverable:** Tables of commands, agents, skills, and hooks; suggested flows for common goals.

---

## Skills

Skills are context fragments loaded automatically by the harness when you edit specific files. They inject rules and reminders into Claude's context — they do not block execution. Enforcement is always at a downstream agent or CI.

| Skill | File pattern trigger | What it injects | Downstream enforcement |
|-------|---------------------|-----------------|----------------------|
| `swagger-sync` | `packages/api/app/controllers/**` or `packages/api/config/routes.rb` | The Swagger hard-rule: update `packages/api/swagger/v1/swagger.yaml` in the same commit. Covers which YAML sections to update (paths, parameters, response schemas). Suggests `/review-commit` next. | `swagger-auditor` agent; CI |
| `actionpolicy-check` | `packages/api/app/controllers/**/*_controller.rb` | `authorize!` requirement at the top of every action, before any business logic. ActionPolicy call patterns; anti-patterns to avoid (skipping auth, calling `policy` without authorizing). | `backend-reviewer` agent; RuboCop |
| `design-system-guide` | `packages/web/src/components/ui/**` | Token rules (CSS custom properties only — no raw hex), dark mode parity requirements, a11y primitives checklist, Figma MCP hooks for design reference, and a nudge to use `/migrate-component` for full Figma migrations. | `component-reviewer` agent; `ui-visual-reviewer` agent; Playwright CI |

> Skills load at edit time — catching violations before they reach a reviewer saves a full review cycle.

---

## Hooks

Hooks run silently via the harness events. They are registered in `.claude/settings.json` and run outside Claude's context.

| Hook | Event | Trigger | What it runs | Blocking? |
|------|-------|---------|-------------|-----------|
| `on-edit-lint` | `PostToolUse` | Any `Edit` or `Write` tool call | Prints green Haiku banner to stderr; then `bundle exec rubocop --parallel <file>` for `.rb`; `npx eslint <file>` for `.ts/.tsx/.js/.jsx`; no-op for other types | No — always exits 0. Errors surface in Claude's context as findings. |
| `model-indicator` | `PreToolUse` | Any `Agent` tool call | Reads `tool_input.model`, normalizes version suffix, prints colored banner to stderr: `⚑  OPUS ADVISOR` (red), `⚑  SONNET EXECUTOR` (orange), `⚑  HAIKU EXECUTOR` (green) | No — always exits 0. |

**Implementation:** All hooks are Node.js 22+ TypeScript (`.claude/hooks/*.ts`), no external dependencies, cross-platform (Windows/macOS/Linux).

**Why `on-edit-lint` matters:** Catches lint errors immediately after each file save, before the full `/review-commit` run — tighter feedback loop with no extra steps.

**Why `model-indicator` matters:** Makes model switches visible in the Claude Code execution steps without requiring any manual action. You always know when Opus is advising vs. Sonnet or Haiku executing.

---

## Common Workflows

The primitives compose. These examples show which primitives fire, in what order, for the most common tasks.

### A. Add a new API endpoint

```
1. Edit controller action
   → swagger-sync skill loads: reminder to update swagger.yaml in this commit
   → actionpolicy-check skill loads: reminder to add authorize! at top of action
   → on-edit-lint hook fires: runs RuboCop on the saved file

2. Update packages/api/swagger/v1/swagger.yaml (same commit)

3. Run /review-commit
   → RuboCop, Brakeman, RSpec run in parallel
   → swagger-auditor agent: PASS/FAIL — did swagger.yaml match the diff?
   → backend-reviewer agent: Blockers/Issues/Nits for the Ruby changes
   → Verdict: READY TO PUSH or BLOCK
```

### B. Migrate a UI component from Figma

```
1. Run /migrate-component Button

2. Command reads Figma context (Figma MCP) and current implementation
3. Command lists consumers; flags if any has >5 usages (tripwire pre-check)
4. Command presents migration plan — awaits confirmation

5. component-builder agent writes the component
   → At each step, tripwire check: new variant? new Radix primitive?
     >3 files? new token? >5 consumers?
   → If any tripwire fires: component-reviewer runs (soft gate)
     → If reviewer finds blockers: component-builder stops and reports

6. component-reviewer agent runs final gate
   → Checks: tokens, dark mode, a11y, TypeScript
   → Verdict: APPROVED or CHANGES REQUESTED

7. If reviewer passes: ui-visual-reviewer agent runs Playwright
   → Captures light + dark screenshots
   → Checks visual accuracy, interactive states, regressions
   → Verdict: PASS or FAIL

8. If visual review passes → PR-ready
```

> Editing `components/ui/` files directly (without `/migrate-component`) still loads the `design-system-guide` skill as a lighter inline reminder, and triggers `component-reviewer` when the diff is detected.

### C. Review before opening a PR

**Option A — Standard pre-push check (every PR):**
```
/review-commit
→ Parallel: RuboCop, Brakeman, ESLint, TypeScript, RSpec, Vitest
→ If controllers/routes changed: swagger-auditor (hard gate) + backend-reviewer (soft gate)
→ If .tsx UI files changed: ui-visual-reviewer
→ Verdict: READY TO PUSH or BLOCK
```

**Option B — Deep architectural review (significant PRs):**
```
/review-architecture
→ Staff Engineer lens: maintainability, security, performance
→ Spawns backend-reviewer + swagger-auditor on backend diffs
→ Checks React 19 patterns and TypeScript quality on frontend diffs
→ Verdict: APPROVED | APPROVED WITH SUGGESTIONS | CHANGES REQUESTED
→ More thorough; takes longer than /review-commit
```

### D. Debug an issue

```
1. /debug-issue → grep for symbols → trace call sites → read files
   → recent commits (most common root cause)
   → find test coverage gaps

2. If UI regression: /review-commit detects UI diffs → ui-visual-reviewer
   captures before/after screenshots

3. For browser-level investigation: /playwright-cli for automation commands

4. After fix: /review-commit to gate before pushing
```

### E. Onboard a new engineer

```
/onboard → 4 exercises (~10 minutes):
1. Run /help-tooling — read the live catalog
2. Add a dummy endpoint — watch swagger-sync, actionpolicy-check,
   and on-edit-lint fire live in real time
3. Touch a components/ui/ file — watch design-system-guide fire
4. Read AGENTS-SKILLS.md — understand the full architecture
```

---

## The Tutor Layer

Every primitive can explain itself. Ask *"how does `backend-reviewer` work?"* or *"why did `swagger-auditor` fire?"* and Claude replies with a targeted explanation.

`DB90_COACHING=true` (default in `.claude/settings.json`) appends coaching trailers to agent output:

> *(You saw `swagger-auditor` because your diff touched a controller. Run `/help-tooling swagger-auditor` for more.)*

To silence: add `"DB90_COACHING": "false"` to `.claude/settings.local.json` (gitignored).

---

## File Map

```
.claude/
├── agents/
│   ├── backend-reviewer.md       # Reviewer: Ruby/Rails conventions
│   ├── component-builder.md      # Executor: Figma-driven UI components
│   ├── component-reviewer.md     # Reviewer: design tokens, dark mode, a11y
│   ├── swagger-auditor.md        # Auditor: swagger.yaml hard gate
│   └── ui-visual-reviewer.md    # Reviewer: Playwright visual regression
├── commands/
│   ├── migrate-component.md      # /migrate-component
│   ├── implement-design.md       # /implement-design
│   ├── tailwind-v4-shadcn.md    # /tailwind-v4-shadcn
│   ├── review-architecture.md   # /review-architecture
│   ├── review-commit.md         # /review-commit
│   ├── review-changes.md        # /review-changes
│   ├── typescript-react-reviewer.md  # /typescript-react-reviewer
│   ├── debug-issue.md           # /debug-issue
│   ├── explore-codebase.md      # /explore-codebase
│   ├── playwright-cli.md        # /playwright-cli
│   ├── playwright-best-practices.md  # /playwright-best-practices
│   ├── postgresql-table-design.md    # /postgresql-table-design
│   ├── postgresql-optimization.md    # /postgresql-optimization
│   ├── manage-worktrees.md      # /manage-worktrees
│   ├── refactor-plan.md         # /refactor-plan
│   ├── onboard.md               # /onboard
│   ├── tanstack-query-best-practices.md  # /tanstack-query-best-practices
│   ├── discover-skills.md       # /discover-skills
│   └── help-tooling.md          # /help-tooling
├── hooks/
│   ├── on-edit-lint.ts           # PostToolUse: Haiku banner + lint on every file save
│   └── model-indicator.ts        # PreToolUse(Agent): colored model banner (Opus/Sonnet/Haiku)
├── scripts/
│   ├── risk-score.ts             # Deterministic risk scorer used by /review-changes
│   └── convention-check.ts       # Branch + commit format checker used by /review-commit (Step 0)
└── settings.json                 # Hook registration, permissions, DB90_COACHING
```
