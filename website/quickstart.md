# Quickstart

This guide takes you from zero to a running Aixle Insights instance in under 10 minutes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose — that's it for running the app

> **Contributing / local dev:** Ruby 3.4.8 and Node.js 24.x are also needed if you plan to run tests or the Temporal worker outside Docker. Use [asdf](https://asdf-vm.com) with `.tool-versions` for automatic version switching.

## 1. Clone and configure

```bash
git clone https://github.com/AixleHQ/insights.git
cd insights
cp .env.example .env
cp packages/web/.env.example packages/web/.env
```

Both `.env` files have safe defaults for local development. The only optional credential is Google OAuth (for social login — you can skip it and use Keycloak's built-in login).

See [Configuration →](/guide/configuration) for a full env-var reference.

## 2. Start everything

```bash
make setup
```

This single command:
1. Builds Docker containers
2. Starts all services (Postgres, Redis, Keycloak, Temporal, MinIO)
3. Creates and migrates the database
4. Seeds the database with development fixture data

The first run downloads images and compiles assets — expect 3–5 minutes. Subsequent runs are fast.

## 3. Log in for the first time

Aixle Insights uses Keycloak for authentication. After `make setup`, create a local user:

1. Open [http://localhost:8080](http://localhost:8080) — Keycloak admin console (username: `admin`, password: `admin`)
2. Select the **db90** realm from the dropdown (top-left)
3. Go to **Users → Add user** — set a username and email, then click **Create**
4. On the **Credentials** tab, set a password and turn off **Temporary**

Open [http://localhost:5173](http://localhost:5173) and log in. On first login Rails creates your account and prompts you to create an organization.

> **About seeded data:** `make setup` seeds 100 simulated engineers with 45 days of events. Your fresh login starts a new org with no events. Connect a tool via the [Connecting Tools guide →](/guide/connectors) to start seeing real data.

## 4. Open the app

| URL | Service |
|-----|---------|
| [http://localhost:5173](http://localhost:5173) | Aixle Insights web UI |
| [http://localhost:3000](http://localhost:3000) | Rails API |
| [http://localhost:8080](http://localhost:8080) | Keycloak (admin/admin) |
| [http://localhost:8088](http://localhost:8088) | Temporal UI |
| [http://localhost:9001](http://localhost:9001) | MinIO console |

## Running tests

```bash
make test-api    # RSpec
make test-web    # Vitest
```

## Common make targets

Run `make help` for the full list. Frequently used:

| Command | What it does |
|---------|-------------|
| `make up` | Start Docker services (without setup) |
| `make down` | Stop services |
| `make db-migrate` | Run pending migrations |
| `make db-seed` | Re-seed sample data |
| `make db-reset` | Drop, recreate, migrate, seed |
| `make lint` | Run all linters (RuboCop + ESLint) |
| `make logs` | Tail all service logs |
| `make logs-api` | Tail Rails API logs |

## Next steps

- [Connect your first AI tool →](/guide/connectors)
- [Full environment variable reference →](/guide/configuration)
- [Architecture overview →](/reference/architecture)
