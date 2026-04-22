---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(bundle exec rubocop:*), Bash(bundle exec brakeman:*), Bash(bundle exec rspec:*), Bash(npm run:*), Bash(npx tsc:*), Bash(npx vitest:*)
description: Review Ruby/Rails and JavaScript/TypeScript commits before pushing
---

## Context

- Current branch: !`git branch --show-current`
- Base branch: develop
- Commits ahead of base: !`git log develop..HEAD --oneline`
- Changed Ruby files: !`git diff develop..HEAD --name-only -- '*.rb'`
- Changed JS/TS files: !`git diff develop..HEAD --name-only -- '*.ts' '*.tsx' '*.js' '*.jsx'`
- Full Ruby diff: !`git diff develop..HEAD -- '*.rb'`
- Full JS/TS diff: !`git diff develop..HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx'`

## Your task

Review all changes on this branch before they are pushed. Run all steps in order.

---

### Step 0 — Convention check (Haiku)

```bash
node --experimental-strip-types --no-warnings ${CLAUDE_PROJECT_DIR}/.claude/scripts/convention-check.ts
```

Checks branch name and commit message format against DB90 conventions. Any failures appear in the final report as WARN — they do not block Steps 1–4.

---

### Step 1 — Automated checks (run all in parallel)

1. **RuboCop** — lint changed Ruby files:
   ```
   BASE=$(git branch --show-current | grep -q '^hotfix/' && echo main || echo develop)
   cd packages/api && bundle exec rubocop --parallel $(git -C .. diff $BASE..HEAD --name-only -- '*.rb' | sed 's|packages/api/||' | tr '\n' ' ')
   ```
   Skip if no Ruby files changed.

2. **Brakeman** — Rails security scan:
   ```
   cd packages/api && bundle exec brakeman --no-pager -q
   ```
   Skip if no Ruby files changed.

3. **ESLint** — lint changed JS/TS files:
   ```
   cd packages/web && npm run lint
   ```
   Skip if no JS/TS files changed.

4. **TypeScript typecheck**:
   ```
   cd packages/web && npx tsc --noEmit
   ```
   Skip if no JS/TS files changed.

---

### Step 2 — Run affected tests (run both in parallel)

**RSpec** — find and run specs matching changed Ruby source files:
- Map each changed `app/` file to its `spec/` counterpart (e.g., `app/models/user.rb` → `spec/models/user_spec.rb`).
- Run:
  ```
  cd packages/api && bundle exec rspec <matched spec files>
  ```
- Skip if no Ruby files changed or no matching specs found (note it).

**Vitest** — run only tests related to changed JS/TS files:
```
cd packages/web && npx vitest related $(git diff develop..HEAD --name-only -- '*.ts' '*.tsx' '*.js' '*.jsx' | sed 's|packages/web/||' | tr '\n' ' ') --run
```
Skip if no JS/TS files changed.

---

### Step 2.5 — Visual review (UI changes only)

If any `.tsx` files under `packages/web/src/` are in the diff (components, pages, or UI hooks), spawn `ui-visual-reviewer` as a subagent before proceeding to Step 3.

`ui-visual-reviewer` will:
- Run Playwright if configured, or fall back to Claude_Preview.
- Verify visual accuracy in light and dark themes.
- Check feature behavior for key interactions.

If `ui-visual-reviewer` returns failures, report them alongside the Step 3 findings — do not block Step 3.

Skip this step if no `.tsx` files changed.

---

### Step 3 — Code review of the diff

Review both diffs and check for:

**Ruby / Rails:**
1. **RuboCop compliance** — style issues beyond what was already reported
2. **Rails best practices** — N+1 queries, missing indexes, misuse of callbacks, non-reversible migrations
3. **Security** — SQL injection, mass assignment, sensitive data exposure, unsafe redirects
4. **Logic bugs** — nil handling, missing validations, incorrect associations, off-by-one errors
5. **Test coverage** — are changes adequately tested? Edge cases covered?
6. **Swagger sync** — if any controller actions or routes were added or modified, verify that `packages/api/swagger/v1/swagger.yaml` was also updated in this branch. Check with: `git diff develop..HEAD --name-only | grep swagger`. If controllers changed but swagger did not, flag this as a BLOCK.

**JavaScript / TypeScript:**
1. **Type safety** — improper use of `any`, missing types, unsafe type assertions
2. **React best practices** — missing `useEffect` dependencies, stale closures, improper key props, unnecessary re-renders
3. **TanStack Query** — direct `fetch`/`axios` usage in components instead of query hooks
4. **Security** — XSS risks, unsafe `dangerouslySetInnerHTML`, sensitive data in client state
5. **Logic bugs** — incorrect async/await handling, unhandled promise rejections, race conditions
6. **Test coverage** — are component/hook changes covered by Vitest tests?

**Both:**
- **CLAUDE.md compliance** — do changes follow the project conventions documented in CLAUDE.md?

---

### Step 4 — Report

Output a concise report:

---

## Pre-push Review

### Automated checks
**Ruby/Rails**
- RuboCop: [PASS / FAIL — list offenses]
- Brakeman: [PASS / FAIL — list warnings]
- RSpec: [PASS / X failures — list failures]

**JavaScript/TypeScript**
- ESLint: [PASS / FAIL — list offenses]
- TypeScript: [PASS / FAIL — list errors]
- Vitest: [PASS / X failures — list failures]

### Code review findings
List only real issues (no nitpicks). For each:
- **[Severity: HIGH/MEDIUM/LOW]** Description — `file:line`

### Verdict
- **READY TO PUSH** — all checks pass, no blocking issues found.
- **BLOCK: fix before pushing** — list what must be fixed.

---

If all automated checks pass and no HIGH/MEDIUM issues are found, conclude with "READY TO PUSH".
