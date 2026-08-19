# Configuration

All environment variables are set in `.env` (copied from `.env.example`). The `docker-compose.yml` passes them into the API container.

## Core API

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_HOST` | Production | Public hostname of the deployed app (e.g. `insights.aixle.com`) |
| `INTERNAL_API_HOST` | Production | Cloud Map / service-discovery hostname for internal services (e.g. Temporal worker). Leave blank in local dev. |
| `FRONTEND_URL` | Yes | Web app origin — used to build OAuth callback URLs (default: `http://localhost:5173`) |

> In local dev, `DATABASE_URL`, `REDIS_URL`, and other infra vars are pre-set in `docker-compose.yml` — you do not need to add them to `.env`.

## Auth (Keycloak)

Keycloak is pre-configured in `docker-compose.yml` for local dev. For production deployments, set:

| Variable | Description |
|----------|-------------|
| `KEYCLOAK_URL` | Keycloak server URL |
| `KEYCLOAK_REALM` | Realm name |
| `KEYCLOAK_CLIENT_ID` | API client ID |
| `KEYCLOAK_CLIENT_SECRET` | API client secret |

### Google OAuth (optional)

For Google social login via Keycloak:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Create credentials at [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials). Set the authorized redirect URI to:
```
http://localhost:8080/realms/db90/broker/google-dbp/endpoint
```

## Connector OAuth Credentials

Only required for the connectors you want to use. See [Connecting Tools →](/guide/connectors) for how to create each OAuth app.

| Variable | Provider |
|----------|----------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub |
| `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | GitLab |
| `BITBUCKET_CLIENT_ID` / `BITBUCKET_CLIENT_SECRET` | Bitbucket |
| `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET` | Jira (Atlassian) |
| `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` | Linear |

Anthropic, OpenAI, OpenRouter, and Gemini are key-only — no OAuth vars needed (keys are entered in the UI Connect sheet).

## Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `AIXLE_INSIGHTS_PROMPT_CAPTURE` | `false` | Enable prompt capture pipeline (opt-in, off by default) |
| `MAX_RETENTION_DAYS` | `720` | Maximum event retention ceiling for the `tool_events` hypertable |
| `RUN_HEAVY_SEED` | _(unset)_ | Set to `1` on staging to run the simulation seed (100 engineers, ~50k events). Always runs in development. |

## OAuth HTTP timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| `OAUTH_HTTP_OPEN_TIMEOUT` | `5` | TCP connect timeout (seconds) for provider OAuth calls |
| `OAUTH_HTTP_TIMEOUT` | `15` | Read timeout (seconds) — protects Sidekiq workers during provider outages |

## Web frontend (`packages/web/.env`)

Copy `packages/web/.env.example` to `packages/web/.env`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api/v1` | API path — routes through the Vite dev proxy to `localhost:3000` |
| `VITE_KEYCLOAK_URL` | `http://localhost:8080` | Keycloak server URL |
| `VITE_KEYCLOAK_REALM` | `db90` | Keycloak realm name |
| `VITE_KEYCLOAK_CLIENT_ID` | `db90-web` | Keycloak public client ID |
| `VITE_INGEST_BASE_URL` | `http://localhost:3000` | Direct API URL used in shell hook snippets (bypasses Vite proxy) |
