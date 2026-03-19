# DB90 Rails — Claude Code Guide

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
- **Authorization**: ActionPolicy (not Pundit or CanCan).
- **Background jobs**: Sidekiq. Job classes live in `app/jobs/`.
- **API-only**: No views or assets in the Rails app. All rendering is JSON.

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

## Git Conventions

- Branch from `develop`. Merge to `develop` via PR.
- `staging` branch deploys to staging automatically via CI.
- `main` branch deploys to production.
- Commit messages: `[TICKET-ID] Short description` (e.g., `[AIX-58] Add connector health display`).
- All branches go through CI: RSpec, RuboCop, Brakeman, Vitest, ESLint, TypeScript typecheck.

## Environment

- `.env.example` — copy to `.env` and fill in values (Google OAuth credentials required).
- `.tool-versions` — use asdf to install correct Ruby and Node versions.
- Docker Compose manages all backing services locally.
