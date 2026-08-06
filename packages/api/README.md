# Aixle Insights — API (`packages/api`)

Rails 8.1 API-only backend for Aixle Insights: ingests AI coding-assistant
telemetry and serves the analytics dashboard consumed by `packages/web`.

## Stack

- **Ruby 3.4.8** / **Rails 8.1.2** (API-only — no views or asset pipeline)
- **PostgreSQL 17 + TimescaleDB** for time-series event data
- **Sidekiq** (+ `sidekiq-cron`) for background jobs; **Temporal** (`temporalio`) for
  long-running, durable workflows
- **Alba** for JSON serialization
- **ActionPolicy** for authorization (`app/policies/`)
- **Administrate** for the internal admin dashboard
- **JWT** / Keycloak (OIDC) for authentication
- **RSpec** + FactoryBot + Faker + Shoulda Matchers for tests
- **RuboCop** (`rubocop-rails-omakase`) for linting
- **rswag** — the OpenAPI spec lives at `swagger/v1/swagger.yaml` and must stay in
  sync with the controllers/routes (see repo-root `CLAUDE.md`)

## Application layers

Beyond standard MVC, the app uses:

- `app/services/` — multi-step operations that don't belong in a model or controller
- `app/query_builders/` — complex ActiveRecord queries (kept out of models/controllers)
- `app/policies/` — ActionPolicy authorization
- `app/serializers/` — Alba serializers
- `app/forms/`, `app/state_machines/`, `app/middleware/` — form objects, state machines, Rack middleware
- `app/dashboards/` — Administrate dashboard definitions
- `app/jobs/` — Sidekiq jobs

## Running

Everything runs in Docker from the repo root — see the root `README.md` and `Makefile`:

```bash
make up          # start all services (Postgres/Timescale, Redis, API, web, …)
make api         # start/attach just the Rails API (http://localhost:3000)
make console     # Rails console inside the api container
make db-migrate  # run migrations
make db-seed     # seed development data
```

For direct Ruby commands (`bundle exec …`, `rails runner`, `rspec`), run them from
this directory (`packages/api/`) — the `Gemfile` lives here.

## Testing & linting

```bash
make test-api    # RSpec (from repo root)
make lint-api    # RuboCop

# or directly, from packages/api/
bundle exec rspec
bundle exec rubocop --parallel
```

Integration/request specs use a real database with transactions — do not mock the DB.

## Conventions

Backend conventions (Alba, ActionPolicy, mandatory Swagger sync, layered architecture,
commit format) are documented in the repo-root `CLAUDE.md`. When you add or change a
controller action or route, update `swagger/v1/swagger.yaml` in the same commit.
