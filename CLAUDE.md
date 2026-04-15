# DB90 Rails — Claude Code Guide

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
- **Authorization**: ActionPolicy (not Pundit or CanCan). Policies live in `app/policies/` and inherit from `ApplicationPolicy`. Always call `authorize!` at the start of controller actions.
- **Background jobs**: Sidekiq for standard async jobs (`app/jobs/`). Temporal.io for long-running, multi-step, or durable workflows — use Temporal when a job needs retries with state, human-in-the-loop steps, or orchestration across services.
- **API-only**: No views or assets in the Rails app. All rendering is JSON.

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

### Commands (use `/worktrees` skill)

| Step        | Command                                      | Where            |
| ----------- | -------------------------------------------- | ---------------- |
| 1. Create   | `/worktrees create a worktree for AIX-XX` | main repo        |
| 2. Navigate | `/worktrees open worktree AIX-XX`         | main repo        |
| 3. Open     | `cd <worktree-path> && claude`               | terminal         |
| 4. Work     | commit + push normally                       | worktree session |
| 5. Clean up | `/worktrees clean up worktree AIX-XX`     | main repo        |

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

<!-- code-review-graph MCP tools -->

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool                        | Use when                                               |
| --------------------------- | ------------------------------------------------------ |
| `detect_changes`            | Reviewing code changes — gives risk-scored analysis    |
| `get_review_context`        | Need source snippets for review — token-efficient      |
| `get_impact_radius`         | Understanding blast radius of a change                 |
| `get_affected_flows`        | Finding which execution paths are impacted             |
| `query_graph`               | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes`     | Finding functions/classes by name or keyword           |
| `get_architecture_overview` | Understanding high-level codebase structure            |
| `refactor_tool`             | Planning renames, finding dead code                    |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
