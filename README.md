# DB90

AI tool analytics platform for tracking and managing coding assistant usage across organizations. Monitors tools like ChatGPT, Claude, GitHub Copilot, and others — capturing token consumption, costs, and usage patterns with built-in risk scanning and data retention policies.

## Architecture

```
db90-rails/
├── packages/
│   ├── api/          # Rails 8.1 API (port 3000)
│   └── web/          # React + Vite frontend (port 5173)
├── temporal/         # Temporal.io workflow workers
├── keycloak/         # Realm config & custom themes
└── docker-compose.yml
```

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query |
| Backend | Rails 8.1 (API-only), Alba serializers, Action Policy |
| Database | PostgreSQL 17 + TimescaleDB (time-series hypertables) |
| Auth | Keycloak (OIDC) with optional Google social login |
| Workflows | Temporal.io (Ruby SDK) for ingestion/sanitization pipelines |
| Storage | MinIO (S3-compatible), Redis |

## Prerequisites

- **Ruby** 3.4.8 and **Node.js** 24.13.0 (see `.tool-versions` — [asdf](https://asdf-vm.com) recommended)
- **Docker** and Docker Compose
- **Bundler** (`gem install bundler`)

## Getting Started

### 1. Start infrastructure

```bash
make up
```

This launches all Docker services:

| Service | URL |
|---------|-----|
| PostgreSQL (TimescaleDB) | `localhost:5432` |
| Redis | `localhost:6379` |
| Keycloak | [localhost:8080](http://localhost:8080) (admin/admin) |
| Temporal | `localhost:7233` |
| Temporal UI | [localhost:8088](http://localhost:8088) |
| MinIO | [localhost:9000](http://localhost:9000) (console: [9001](http://localhost:9001)) |

### 2. Install dependencies

```bash
cd packages/api && bundle install
cd ../web && npm install
cd ../../temporal && bundle install
```

### 3. Set up the database

```bash
make db-create
make db-migrate
make db-seed        # loads ~100 simulated engineers over 45 days
```

### 4. Configure environment

Copy the example env files and fill in values as needed:

```bash
cp .env.example .env                       # Google OAuth credentials (optional)
cp packages/web/.env.example packages/web/.env
```

The web defaults work out of the box for local development:

```
VITE_API_URL=/api/v1
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=db90
VITE_KEYCLOAK_CLIENT_ID=db90-web
```

### 5. Run the app

In separate terminals:

```bash
make api      # Rails at http://localhost:3000
make web      # Vite at http://localhost:5173
make worker   # Temporal worker (optional)
```

Open [localhost:5173](http://localhost:5173) and log in via Keycloak.

### Automated setup

Alternatively, `make setup` (or `./scripts/setup.sh`) runs steps 2–4 in one shot.

## Auth

Keycloak manages authentication via OpenID Connect. The frontend uses `oidc-client-ts` to handle the OAuth code flow, and the Rails API validates JWTs on every request.

- **Realm**: `db90`
- **Client**: `db90-web` (public)
- **Admin console**: [localhost:8080](http://localhost:8080) — username `admin`, password `admin`
- **Google login**: Optional — set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

## Makefile Reference

```
make help             Show all commands

make up / down        Start / stop Docker services
make logs             Tail Docker logs

make api              Start Rails server
make web              Start Vite dev server
make worker           Start Temporal worker

make db-create        Create databases
make db-migrate       Run migrations
make db-seed          Seed sample data
make db-reset         Drop and recreate everything

make test             Run all tests
make test-api         RSpec (Rails)
make test-web         Vitest (frontend)

make lint             Run all linters
make lint-api         Rubocop
make lint-web         ESLint

make generate-types   Generate TypeScript types from OpenAPI
make clean            Remove build artifacts
```

## Testing

```bash
make test-api                          # RSpec
make test-web                          # Vitest
cd packages/web && npx playwright test # E2E (starts servers automatically)
```

## Ports

| Port | Service |
|------|---------|
| 3000 | Rails API |
| 5173 | Vite dev server |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 7233 | Temporal gRPC |
| 8080 | Keycloak |
| 8088 | Temporal UI |
| 9000 | MinIO API |
| 9001 | MinIO Console |
