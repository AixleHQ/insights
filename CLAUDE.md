# DB90 Rails — Claude Code Guide

> For a full guide to the Claude tooling (commands, agents, skills, hooks, workflows), see [AGENTS.md](AGENTS.md).

## Executor / Advisor Pattern

This project uses the [Advisor Strategy](https://claude.com/blog/the-advisor-strategy): Sonnet executes, Opus advises. This is the default behavior for all substantive work — it does not need to be wired per-command.

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

**Do not escalate for:**
- Reference lookups, explanations, or reading files
- Single-file edits that follow an established pattern already in the codebase
- Lint fixes, typo corrections, test additions matching existing patterns
- Commands explicitly marked as reference-only (no file writes)

## Stack

- Backend: Ruby (RSpec for tests)
- Frontend: TypeScript (React)
- This is a full-stack monorepo. Most features require changes across both backend and frontend.

## Project Overview

DB90 is an AI tool analytics platform that tracks and manages coding assistant usage across organizations. It monitors token consumption, costs, and usage patterns for tools like ChatGPT, Claude, and GitHub Copilot, with risk scanning and data retention policies.

## Architecture

Monorepo with two main packages:

- `packages/api/` — Rails 8.1.2 API-only (Ruby 3.4.8), PostgreSQL 17 + TimescaleDB
- `packages/web/` — React 19 + TypeScript + Vite frontend

Supporting services (via Docker Compose): Redis, Sidekiq, Temporal.io, Keycloak (OIDC auth), MinIO (S3-compatible storage).

## Key Commands

```bash
make up            # Start all Docker services
make api           # Run Rails API (port 3000)
make web           # Run Vite dev server (port 5173)
make test          # Run all tests (RSpec + Vitest)
make test-api      # RSpec only
make test-web      # Vitest only
make lint          # Run all linters (RuboCop + ESLint)
make lint-api      # RuboCop
make lint-web      # ESLint
make db-migrate    # Run pending migrations
make db-seed       # Seed the database
```

All commands run from the repo root via `Makefile`.

## Ruby / Rails Guidelines

- **Ruby version**: 3.4.8 (managed via asdf, see `.tool-versions`)
- **Linting**: RuboCop with `rubocop-rails-omakase`. Always run `bundle exec rubocop --parallel` before committing.
- **Security**: Brakeman for static analysis. Run `bundle exec brakeman` to check for vulnerabilities.
- **Dependency audit**: `bundle exec bundler-audit` before pushing.
- **Testing**: RSpec with FactoryBot, Faker, Shoulda Matchers. Test files live in `packages/api/spec/`.
  - Run tests with `make test-api` or `bundle exec rspec` from `packages/api/`.
  - Do not mock the database in integration/request specs — use real DB with transactions.
- **Serializers**: Alba (not ActiveModelSerializers or Blueprinter).
- **Authorization**: ActionPolicy (not Pundit or CanCan). Policies live in `app/policies/` and inherit from `ApplicationPolicy`. Always call `authorize!` at the start of controller actions. Enforced by the `actionpolicy-check` skill.
- **Background jobs**: Sidekiq for standard async jobs (`app/jobs/`). Temporal.io for long-running, multi-step, or durable workflows — use Temporal when a job needs retries with state, human-in-the-loop steps, or orchestration across services.
- **API-only**: No views or assets in the Rails app. All rendering is JSON.
- **Swagger is mandatory**: Whenever you add or modify a controller action or route, update `packages/api/swagger/v1/swagger.yaml` in the same commit. The spec lives at that path and must stay in sync with the implementation at all times. This applies to new endpoints, changed response shapes, new query parameters, and removed endpoints. Enforced by the `swagger-sync` skill + `swagger-auditor` agent.

### Application Layer Conventions

The Rails app uses a layered architecture beyond standard MVC:

- `app/domain/` — Domain-Driven Design: entities, value objects, aggregates. Use for core business logic that is independent of Rails.
- `app/services/` — Service objects for multi-step operations that don't belong in a single model or controller.
- `app/query_builders/` — Query builder objects for complex ActiveRecord queries. Keep controllers and models free of query logic.
- `app/repositories/` — Repository pattern for data access abstraction, particularly for domain objects.
- `app/policies/` — ActionPolicy authorization policies. All policies inherit from `ApplicationPolicy`.

Follow this decision hierarchy: standard Rails patterns first → existing codebase patterns → new patterns (justify explicitly).

## JavaScript / TypeScript Guidelines

- **TypeScript strict mode** — no `any` types unless absolutely unavoidable.
- **Component library**: shadcn/ui (Radix UI). Prefer existing components over custom ones.
- **State / data fetching**: TanStack Query (React Query). Do not use raw `fetch` or `axios` in components.
- **Routing**: React Router 7.
- **Testing**: Vitest + React Testing Library. Tests live in `packages/web/src/test/` and colocated with components.

## Database

- PostgreSQL 17 with TimescaleDB for time-series data.
- Multi-database setup in production (primary, cache, queue, cable).
- Migrations live in `packages/api/db/migrate/`. Always write reversible migrations.
- Never drop columns in the same migration that removes them from the model — use a two-step deploy.

## Git Workflow

- When cleaning up worktrees, always `cd` to the main repo directory first to avoid CWD removal issues.
- Before creating a PR, verify `gh auth status` succeeds. If not, inform the user instead of attempting and failing.
- Worktree branch naming convention: `<ticket-id>` (e.g., `AIX-62`).
- **Before every commit, run linters** via `make lint-api` (RuboCop) and/or `make lint-web` (ESLint) depending on what changed. Fix all errors before committing. Warnings are acceptable but errors must be resolved.

## Git Conventions

### Branch Naming

Always branch from `develop`. Branch names follow this format:

```
feature/AIX-XX-short-description
```

- `AIX-XX` is the Linear ticket ID (e.g., `AIX-61`)
- `short-description` is kebab-case, 2-4 words summarizing the work
- Examples: `feature/AIX-61-user-auth`, `feature/AIX-72-slack-alerts`

Never branch from `staging` or `main`.

### Commit Messages

```
[AIX-XX] Short imperative description
```

- Always prefix with the ticket ID in brackets
- Use imperative mood: "Add", "Fix", "Update", "Remove" — not "Added" or "Adds"
- Keep the subject line under 72 characters
- Examples:
  - `[AIX-58] Add connector health display`
  - `[AIX-61] Fix N+1 query in usage report`

### Flow

- All feature branches merge to `develop` via PR
- `staging` branch deploys to staging automatically via CI
- `main` branch deploys to production
- All branches go through CI: RSpec, RuboCop, Brakeman, Vitest, ESLint, TypeScript typecheck

## Worktree Workflow

Each ticket gets its own git worktree — a separate directory on its own branch, sharing the same repo history. This lets you work on multiple tickets simultaneously without switching branches.

### Commands (use `/manage-worktrees` skill)

| Step        | Command                                             | Where            |
| ----------- | --------------------------------------------------- | ---------------- |
| 1. Create   | `/manage-worktrees create a worktree for AIX-XX` | main repo        |
| 2. Navigate | `/manage-worktrees open worktree AIX-XX`         | main repo        |
| 3. Open     | `cd <worktree-path> && claude`                      | terminal         |
| 4. Work     | commit + push normally                              | worktree session |
| 5. Clean up | `/manage-worktrees clean up worktree AIX-XX`     | main repo        |

### Directory structure

```
~/
  db90-rails/              # main repo (develop)
  db90-rails-AIX-51/    # worktree for ticket 51
  db90-rails-AIX-72/    # worktree for ticket 72
```

### Rules

- **Never run `bundle install` or `npm install` in a worktree** — `vendor/` and `node_modules/` are symlinked from the main repo. Only reinstall if you added a new gem or package on that branch (remove the symlink first).
- **Docker does not follow symlinks** outside the build context. If you need to run Docker from a worktree, replace the `vendor/` symlink with a real copy: `cp -r ../db90-rails/packages/api/vendor packages/api/vendor`.
- All worktrees share the same `.git` — commits, fetches, and branches are visible everywhere.

## Environment

- `.env.example` — copy to `.env` and fill in values (Google OAuth credentials required).
- `.tool-versions` — use asdf to install correct Ruby and Node versions.
- Docker Compose manages all backing services locally.

## Codebase Exploration

Use Grep, Glob, and Read to explore the codebase. For directed searches (a known file, class, or function) use Grep or Glob directly. For broader exploration use the Explore subagent.
