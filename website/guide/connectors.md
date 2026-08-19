# Connecting Tools

Aixle Insights connects to AI coding tools and development platforms to ingest usage telemetry. Each integration requires an OAuth app or API key registered with the source provider.

> **Where to configure:** once credentials are in `.env` and `docker-compose.yml`, connect the tool in the UI at Settings → Integrations.

After adding credentials, restart the containers:

```bash
docker compose up -d api
```

## AI Coding Tools

### Claude Code

Claude Code reports usage via the `@aixle/insights` MCP server — no OAuth app needed. Install and configure the CLI:

```bash
npx @aixle/insights init \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90
```

See the [CLI / MCP Reference →](/reference/cli) for full setup.

### Cursor

Cursor telemetry is collected from its local SQLite store by the `@aixle/insights` CLI. Install with the `--hooks` flag for per-turn model attribution:

```bash
npx @aixle/insights init --hooks \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90
```

Restart Cursor after init to activate. See the [CLI / MCP Reference →](/reference/cli).

## Source Control & Issue Trackers

### GitHub

1. Go to **Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set **Authorization callback URL** to `http://localhost:5173/integrations/callback`
3. Copy the **Client ID** and generate a **Client Secret**

```env
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

`docker-compose.yml` → `api.environment`:
```yaml
GITHUB_CLIENT_ID: "${GITHUB_CLIENT_ID}"
GITHUB_CLIENT_SECRET: "${GITHUB_CLIENT_SECRET}"
```

### GitLab

1. Go to **Preferences → Applications → Add new application** (or use a [Group](https://gitlab.com/groups) application for shared access)
2. Set **Redirect URI** to `http://localhost:5173/integrations/callback`
3. Enable scopes: `read_user`, `read_api`, `read_repository`
4. Copy the **Application ID** and **Secret**

```env
GITLAB_CLIENT_ID=your-application-id
GITLAB_CLIENT_SECRET=your-secret
```

`docker-compose.yml` → `api.environment`:
```yaml
GITLAB_CLIENT_ID: "${GITLAB_CLIENT_ID}"
GITLAB_CLIENT_SECRET: "${GITLAB_CLIENT_SECRET}"
```

### Bitbucket

> **Note:** Bitbucket OAuth consumers are workspace-level.

1. Log into [Bitbucket.org](https://bitbucket.org) and select your **Workspace**
2. Click **Settings** (gear icon) → **Apps and Features → OAuth consumers → Add consumer**
3. Set **Callback URL** to `http://localhost:5173/integrations/callback`
4. Enable the following permissions:

| Scope | Permission |
|---|---|
| Account | Read |
| Repositories | Read |
| Pull Requests | Read |
| Issues | Read |
| Webhooks | Read and Write |

5. Copy the **Key** (client ID) and **Secret**

```env
BITBUCKET_CLIENT_ID=your-key
BITBUCKET_CLIENT_SECRET=your-secret
```

`docker-compose.yml` → `api.environment`:
```yaml
BITBUCKET_CLIENT_ID: "${BITBUCKET_CLIENT_ID}"
BITBUCKET_CLIENT_SECRET: "${BITBUCKET_CLIENT_SECRET}"
```

### Jira

1. Go to [developer.atlassian.com](https://developer.atlassian.com/console/myapps/) → **Create → OAuth 2.0 integration**
2. Add callback URL `http://localhost:5173/integrations/callback`
3. Add scopes: `read:jira-user`, `read:jira-work`
4. Copy the **Client ID** and **Secret** from the **Authorization** tab

```env
ATLASSIAN_CLIENT_ID=your-atlassian-client-id
ATLASSIAN_CLIENT_SECRET=your-atlassian-client-secret
```

`docker-compose.yml` → `api.environment`:
```yaml
ATLASSIAN_CLIENT_ID: "${ATLASSIAN_CLIENT_ID}"
ATLASSIAN_CLIENT_SECRET: "${ATLASSIAN_CLIENT_SECRET}"
```

### Linear

1. Go to **Settings → API → OAuth applications → Create new**
2. Set **Callback URL** to `http://localhost:5173/integrations/callback`
3. Copy the **Client ID** and **Client Secret**

```env
LINEAR_CLIENT_ID=your-client-id
LINEAR_CLIENT_SECRET=your-client-secret
```

`docker-compose.yml` → `api.environment`:
```yaml
LINEAR_CLIENT_ID: "${LINEAR_CLIENT_ID}"
LINEAR_CLIENT_SECRET: "${LINEAR_CLIENT_SECRET}"
```

## AI APIs (direct key connectors)

No OAuth app needed for these — generate an API key from each provider's console and enter it in the Connect sheet in the UI.

### Anthropic API

Generate a key from the [Anthropic Console](https://console.anthropic.com/settings/keys). The key is validated against `https://api.anthropic.com/v1/models` before being saved.

### OpenAI

Generate a key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Validated against `https://api.openai.com/v1/models`.

### OpenRouter

Generate a key from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). Validated against `https://openrouter.ai/api/v1/models`.

### Gemini

Generate a key from [Google AI Studio](https://aistudio.google.com/app/apikey). Validated against `https://generativelanguage.googleapis.com/v1beta/models`.
