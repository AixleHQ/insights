# @db90/telemetry-mcp

stdio **MCP server** for [DB90](https://db90.io): ingests Claude Code JSONL transcripts and Cursor IDE SQLite telemetry into your organization’s ingest API, exposes operator tools (**`db90_status`**, **`db90_sync_now`**, **`db90_authenticate`**) on the MCP bridge, and pairs with **`db90-mcp init`** so teammates can onboard without juggling cron jobs or brittle shell hooks.

## Integration with db90-rails

The package speaks to **db90-rails API** deployments (local Docker Compose, staging, production). Decide which hat you are wearing:

### Developer (capture your own Claude Code + Cursor usage)

1. **Recommended:** Dashboard **Settings → Integrations → Claude Code → Connect**. After your org provisions **`claude_code`** (and **`cursor`** if applicable), run **`npx -y @db90/telemetry-mcp init`** — Keycloak completes device login and stores credentials locally. You **do not** paste the ingest token for this path unless you choose the manual file fallback documented below.

2. **Pick the API host:**
   | Environment | Typical host / API base (`--host`) |
   |---|---|
   | Local (Rails direct) | `http://localhost:3000` |
   | Local via Vite dev proxy UI | Prefer the API origin your team documents (often still `3000` for ingestion) |
   | Staging / Production | Org-specific HTTPS host (mirror `packages/tools/db90-claude` README guidance) |

3. **Restart Claude Code** after `init` when prompted — the MCP stanza merges into **`~/.claude.json`** (user-level). Project-scoped `.mcp.json` is **not** written by `init`.

### Rails Admin (issue onboarding to developers)

Same flow as Claude CLI onboarding: instruct devs through **Integrations → Connect** so memberships receive eligible tool accounts (`UserToolAccount`), then MCP `init` exchanges OIDC credentials for ingest tokens securely. Refer to **`packages/tools/db90-claude/README.md`** (“Rails Admin”) for token lifecycle nuances — MCP reuses those accounts.

### Platform Owner (publish npm artefacts)

Secrets, tag prefixes, workflows, CI gates: **`packages/tools/RELEASING.md`** (`cli-mcp-v*`). Never publish from laptops — GitHub **`release-cli.yml`** is the audited path.

## Installation

Fresh machine / first teammate run:

```bash
npx -y @db90/telemetry-mcp init --host https://YOUR-API-HOST [--keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM]
```

After credentials exist globally you can invoke **`db90-mcp …`** if the npm bin is on `PATH`; **`npx -y`** remains the safest cross-team instruction.

Local git checkout workflow:

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/telemetry-mcp
```

## Quick Start

```bash
# 1. Complete Integrations onboarding in dashboard (recommended) so tool accounts sync.
npx -y @db90/telemetry-mcp init \
  --host https://YOUR-API-HOST \
  --keycloak-url https://YOUR-KEYCLOAK/realms/db90

# 2. Restart Claude Code → confirm `/mcp` lists **db90**.

# 3. During a Claude session invoke **db90_status**. From shell:
db90-mcp health
```

## First-Run Setup (detailed)

1. **Device login**: `init` prints a verification URI + short user code. Approve login in browser; issuer must expose **RFC 8628 Device Authorization**.
2. **Exchange**: MCP CLI calls **`POST /api/v1/integrations/mcp/exchange`** to mint / bind ingest-ready credentials keyed to your memberships. By default the API uses your **oldest** organization membership; use **`--organization-id <uuid>`** or **`DB90_ORGANIZATION_ID`** to target another org you belong to (HTTP **`X-Organization-ID`**).
3. **Claude install**: merges `db90` server entry into **`~/.claude.json`** with `cmd /c npx …` adaptations on Windows. Use **`--force`** only when replacing a stale/conflicting MCP stanza name collision.
4. **Multi-tool provisioning**: Omit **`--tool-name`** unless you purposely want only one side. Passing **`cursor`** skips Claude MCP auto-install (`--tool-name cursor`).
5. **Advanced override**: **`DB90_MCP_HOME`** repoints **`~/.db90-mcp`** for tests—isolate state/log/credentials directories when automating QA.

### Manual credentials (escape hatch)

Still supported (`~/.db90-mcp/credentials.json`):

```json
{
  "token": "db90_…",
  "host": "https://YOUR-API-HOST"
}
```

Use mode **0600** on POSIX shells. Prefer `init` wherever possible — manual tokens contradict the onboarding story for most orgs.

## Configuration

Environment variables commonly used:

| Variable | Purpose |
|---|---|
| **`DB90_API_URL` / inferred host flags** | API origin for ingestion + MCP exchange orchestration (`init` merges these with CLI flags).
| **`KEYCLOAK_ISSUER`**, **`DB90_KEYCLOAK_ISSUER`** | Realm issuer URLs (preferred on servers & CI publishing guides).
| **`DB90_KEYCLOAK_CLIENT_ID`** | Defaults **`db90-web`**; must allow device authorization in Keycloak.
| **`DB90_MCP_HOME`** | Override state/log base (default **`~/.db90-mcp`**).
| **`DB90_ORGANIZATION_ID`** | Optional UUID for **`init`**: scopes MCP token exchange to that organization (header **`X-Organization-ID`**). The CLI flag **`--organization-id`** overrides this variable when both are set. |
| **`DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=true`** | *Local docker-compose hack only* → auto-default issuer `http://localhost:8080/realms/db90` when unset.

Production / multi-tenant **must set issuer explicitly**. The published npm package refuses unsafe implicit issuers unless the local-default escape hatch flag is deliberately enabled.

### Multi-organization users

If your DB90 user has several organization memberships, **`init`** mints ingest tokens for the **oldest** membership unless you select an org:

```bash
npx -y @db90/telemetry-mcp init \
  --host https://YOUR-API-HOST \
  --keycloak-url https://YOUR-KEYCLOAK/realms/db90 \
  --organization-id 550e8400-e29b-41d4-a716-446655440000
```

You can set **`DB90_ORGANIZATION_ID`** instead (for example under **`mcpServers.db90.env`** in **`~/.claude.json`**). The value must be a valid UUID (RFC 4122 versions 1–5 with the variant nibble enforced by the DB90 API).

## CLI commands (`db90-mcp`)

| Command | Description |
|---|---|
| **`run`** (default) | stdio MCP bridge + background sync timer (5 min cadence after connect + one startup flush when authenticated). Alias: legacy **`serve`**. |
| **`run --once`** | Performs a single sync pass, exits **`1`** if ingestion posts fail — ideal for systemd/cron substitutes. |
| **`init`** | Keycloak/OIDC onboarding, MCP merge, emits restart guidance. Supports **`--tool-name claude_code|cursor`**, **`--organization-id <uuid>`** (optional org for exchange). |
| **`health`** | Human-readable rollup: issuer, ingest tools provisioned, last sync aggregates, **`mcp_operator`**, log path, persisted errors. |

## MCP tools (Claude exposes these)

| Tool | Purpose |
|---|---|
| **`db90_status`** | JSON telemetry snapshot (credentials presence, backoff / rate-limit markers, **`log_path`**, **`mcp_operator`**) |
| **`db90_sync_now`** | Immediately attempt sync guarded by **`state.lock`**. |
| **`db90_authenticate`** | Device login helper JSON (verification URIs/codes)—pair with **`init`** for full exchange. |

## Cursor + Claude multi-tool forwarding

Telemetry collectors run **inside** MCP: duplicated readers keep publish independence from `@db90/claude` / `@db90/cursor` packages. Successful init can provision **`claude_code`** *and* **`cursor`** ingestion accounts simultaneously—then one MCP process fans out events for both workspaces.

SQLite / JSONL checkpoints live under **`~/.db90-mcp`** with namespaced keys like **`claude_code:<session>`** preventing collisions across tools.

## Operational logging & persisted state

- **`mcp.log`**: Structured JSON-ish lines capped at ~**5 MiB** then rotated to **`mcp.log.1`** (deterministic trimming in-process).
- **State shards**: Separate JSON files keyed per credential/tool account; **`mcp_operator`** block stores last ingest metrics + surfaced errors surviving restarts.
- **Lock**: Advisory file **`state.lock`** (or under **`DB90_MCP_HOME`**) avoids duplicate sync stamping when multiple MCP sessions coexist.

Inspect paths quickly:

```bash
ls -lah ~/.db90-mcp
db90-mcp health | sed -n '1,40p'
```

## Verifying end-to-end ingestion

1. **Local**: watch Rails logs (`[Ingest]`) or Temporal UI for **`Workflows::IngestionSanitizationWorkflow`**. Fallback path logs **Temporal workflow failed, falling back to direct insert** when workers offline.
2. **Dashboard**: confirm tool accounts show **recent usage** timestamps for each membership.
3. **MCP self-check**: `db90_status` should show **`last_sync_at`** / aggregates moving after Claude or Cursor emits billable telemetry.

Architectural ingestion reference: **`architecture/mcp-server.md`** in repo root ties MCP readers to **`POST /api/v1/ingest/events`**.

## Troubleshooting

| Symptom | Mitigation |
|---|---|
| **Issuer not configured** | Export **`KEYCLOAK_ISSUER`** / pass **`--keycloak-url`**. For published environments never rely on Compose-only defaults unless flag explicitly set. |
| **Device Authorization Grant disabled** (`db90-web` client) | Keycloak Admin → Clients → **`db90-web`** → Capability config → enable **OAuth 2.0 Device Authorization Grant**. Re-export realm (`keycloak/realm-import.json`). |
| **Conflicting MCP entry** (`db90` stanza mismatched shape) | `init --force` after inspecting **`~/.claude.json`** — ensure you intentionally replace stale commands. |
| **Missing credentials** / malformed JSON files | Inspect **`credentials.json`** perms/content; rerun **`init`**; consult **`health`** diagnostics. |
| **`postEvent` 429 bursts** | Backoff surfaced in **`db90_status`**; wait windows clear automatically (no naive tight retry storms). |

## Local development contributors

Inside monorepo:

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/sdk
npm run build --workspace=@db90/telemetry-mcp
node db90-telemetry-mcp/dist/cli.js health   # Quick smoke against local ~/.db90-mcp
```

Tests stay hermetic via Vitest overrides (`resetBackoffStateForTests`, ingest retry stubs). Prefer **`TMPDIR`/temp** + **`DB90_MCP_HOME`** for integration-style experiments.

Workspace rule reminder: **`cd packages/tools`** for lockfile-aligned installs (**no** lone `npm ci` inside child package dirs).

## Releases & npm guardrails

- Tag pattern **`cli-mcp-vX.Y.Z`** drives CI publish (parity with Claude/Cursor).
- **`prepack`** runs **`packages/tools/scripts/stage-sdk-bundle.mjs`** bundling **`@db90/sdk/dist`** tarballs remain installable despite private SDK upstream.
- **Never retag released npm versions.** Follow **`RELEASING.md`** remediation (forward patch semver).
