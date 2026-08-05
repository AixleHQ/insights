# Aixle Insights Rails — Claude Code Guide

> For commands, agents, skills, workflows, and reference docs (Makefile cheatsheet, git conventions, worktree setup), see [AGENTS.md](AGENTS.md).

## Stack

- Backend: Ruby 3.4.8, Rails 8.1.2 API-only, PostgreSQL 17 + TimescaleDB, RSpec
- Frontend: TypeScript, React 19, Vite, RTL + Vitest
- Full-stack monorepo: `packages/api/` and `packages/web/`. Most features touch both.
- Supporting services (Docker Compose): Redis, Sidekiq, Temporal.io, Keycloak (OIDC), MinIO.

Aixle Insights is an AI tool analytics platform tracking coding-assistant usage (tokens, costs, risk scanning, retention).

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

## Codebase Exploration

Use Grep, Glob, and Read directly for known files/symbols. Use the Explore subagent for broader open-ended exploration.

## Architecture Reference Documents

- Package-level ARDs (for example, `packages/tools/aixle-insights/ARD.md`) are living architecture references.
- When a change alters package architecture, runtime layers, data flow, security boundaries, release/verification architecture, or major design decisions, update the relevant `ARD.md` in the same PR.
- If an architecture change introduces a new package or subsystem without an ARD, create one near that subsystem and link it from the package README when useful.
