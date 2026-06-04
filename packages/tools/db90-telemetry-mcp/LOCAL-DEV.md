# Local MCP setup (npm not published yet)

Step-by-step guide for running **`@db90/telemetry-mcp`** against the **db90-rails** Docker stack while the package is **not on npm** (`npx @db90/telemetry-mcp` → 404).

> **TL;DR:** build the CLI from the monorepo, run `init` against local Keycloak, **patch `~/.claude.json`** to point at the local `dist/cli.js` (because `init` writes `npx`), start the **Temporal worker**, and verify in the Events UI.

---

## Prerequisites

- Cloned repo: `db90-rails`
- [asdf](https://asdf-vm.com/) with Ruby/Node per `.tool-versions`
- Docker Desktop (or equivalent)
- Claude Code installed
- Local Keycloak account (seed user or your own)

---

## 1. Start the DB90 stack

From the repo root:

```bash
make up          # infra + api + web + temporal + keycloak + postgres…
make worker      # ⚠️ required for events to appear in the UI
```

| Service | URL / port | Purpose |
|---------|------------|---------|
| API (ingest) | http://localhost:3000 | `POST /api/v1/ingest/events` |
| Web (UI) | http://localhost:5173 | Events, dashboard |
| Keycloak | http://localhost:8080 | Device login for `init` |
| Temporal UI | http://localhost:8088 | Inspect ingest workflows |

**Important:** `make up` does **not** start the worker. Without `make worker`, the MCP will report `sent: N` (HTTP **202**) but **no new rows** will show in Events — workflows stay queued.

Verify:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'api|worker|keycloak|temporal'
```

You should see **`db90-worker`** in `Up` state.

---

## 2. Build MCP from the monorepo

Always from **`packages/tools`** (workspace lockfile):

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/sdk
npm run build --workspace=@db90/telemetry-mcp
```

Quick smoke:

```bash
node db90-telemetry-mcp/dist/cli.js --help
```

Typical absolute path on macOS:

```text
/Users/<your-user>/db90-rails/packages/tools/db90-telemetry-mcp/dist/cli.js
```

---

## 3. Authentication (`init`)

Local Keycloak uses realm **`db90`**, client **`db90-web`**, with **Device Authorization Grant** enabled (already in repo `keycloak/realm-import.json`).

```bash
cd packages/tools

export DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=true

node db90-telemetry-mcp/dist/cli.js init \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90
```

Flow:

1. CLI prints **verification URI** + **user code**.
2. Open the link in a browser, sign in to Keycloak, approve the code.
3. If Keycloak shows a blank page on device login or OAuth consent, restart Keycloak (`docker compose restart keycloak`) — the `db90` theme fixes are in the repo.

**Organization:** by default `init` uses your **oldest** membership. If you belong to multiple orgs:

```bash
node db90-telemetry-mcp/dist/cli.js init \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90 \
  --organization-id <your-org-uuid>
```

Credentials are stored in:

- **macOS:** Keychain (via `keytar`) — `~/.db90-mcp/credentials.json` may not exist
- **Fallback:** `~/.db90-mcp/credentials.json` (mode `0600`)

Verify:

```bash
node db90-telemetry-mcp/dist/cli.js health
```

Expected: `authenticated: true`, `host: http://localhost:3000`, `ingest_tools: claude_code, cursor`.

---

## 4. Patch `~/.claude.json` (critical step)

`init` merges an MCP server named **`db90`** into **`~/.claude.json`** with:

```json
"command": "npx",
"args": ["-y", "@db90/telemetry-mcp", "run"]
```

That **fails** until npm publish. Replace it with the local build.

### Option A — `jq` (recommended)

Set `CLI` to your absolute path:

```bash
CLI="/Users/<your-user>/db90-rails/packages/tools/db90-telemetry-mcp/dist/cli.js"

cp ~/.claude.json ~/.claude.json.bak && \
jq --arg cli "$CLI" '.mcpServers.db90 = {
  "command": "node",
  "args": [$cli, "run"],
  "env": { "DB90_API_URL": "http://localhost:3000" }
}' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

### Option B — edit manually

In `~/.claude.json` → `mcpServers.db90`:

```json
"db90": {
  "command": "node",
  "args": [
    "/Users/<your-user>/db90-rails/packages/tools/db90-telemetry-mcp/dist/cli.js",
    "run"
  ],
  "env": {
    "DB90_API_URL": "http://localhost:3000"
  }
}
```

> After each `init --force` you must repeat this step until npm is published or the install script detects the monorepo checkout.

---

## 5. Restart Claude Code

1. **Fully quit** Claude Code (`/exit` in one session is not enough).
2. Reopen Claude Code in the `db90-rails` repo.
3. In chat: **`/mcp`** → server must be named **`db90`** (not “telemetry-mcp”) and show **connected**.

Available MCP tools:

| Tool | Purpose |
|------|---------|
| `db90_status` | Credentials, last sync, errors |
| `db90_sync_now` | Immediate manual sync |
| `db90_authenticate` | Device-flow re-login |

Automatic sync: ~**5 minutes** + one flush on connect.

---

## 6. Verify end-to-end ingest

### Shell

```bash
# Single sync pass (exit 1 if POST fails)
node db90-telemetry-mcp/dist/cli.js run --once

# Diagnostics
node db90-telemetry-mcp/dist/cli.js health
tail -20 ~/.db90-mcp/mcp.log
```

### API / DB

```bash
# Ingest logs
docker logs db90-api --tail 50 | grep -i ingest

# Row count in Postgres (timeseries schema)
docker exec db90-postgres psql -U postgres -d db90_development \
  -c "SELECT COUNT(*) FROM timeseries.tool_events;"
```

### UI

1. http://localhost:5173 → local Keycloak login
2. Select the **same org** you used in `init` (`--organization-id` if applicable)
3. **Events** → refresh

**First sync expectation:** MCP may send **hundreds** of historical events (Claude transcripts + Cursor SQLite). The table sorts by **`occurred_at`** (when activity happened), not when you synced — expect rows from months ago mixed with today.

---

## 7. What “Sync complete — N sent” means

| Metric | Meaning |
|--------|---------|
| **sent** | HTTP **202 Accepted** from the API (event queued in Temporal) |
| **skipped** | Already synced (checkpoint / watermark / dedupe) |
| **failed** | POST rejected (401, 429, network, etc.) |

**sent ≠ row in UI.** You also need:

1. `make worker` running
2. Worker completes the workflow → upsert into `timeseries.tool_events`
3. Refresh Events

If Temporal is down, the API may **fallback to direct insert** (logs: `Temporal workflow failed, falling back to direct insert`).

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/mcp` missing `db90` or **failed** | `npx @db90/telemetry-mcp` in `~/.claude.json` | Section 4 — patch to `node …/dist/cli.js` |
| `health` → `authenticated: false` | No credentials / incomplete init | Re-run `init` (section 3) |
| `sent: N`, UI empty of **new** events | Worker not running | `make worker` |
| Keycloak device login blank page | Theme CSS | `docker compose restart keycloak`; pull latest `keycloak/themes/db90/` |
| `Device Authorization Grant` disabled | Client `db90-web` | Admin → Clients → `db90-web` → enable OAuth 2.0 Device Authorization Grant |
| First sync = 500+ sent, UI “nothing new today” | Historical backfill | Expected; filter by tool or recent `occurred_at` |
| `401` on ingest (Cursor hooks) | Different token than MCP | Hooks use another `UserToolAccount`; reconfigure integrations |
| Rebuild after code changes | Stale `dist/` | Repeat section 2 + restart Claude Code |

### Useful logs

```bash
~/.db90-mcp/mcp.log          # sync, skips, MCP errors
docker logs db90-api           # ingest 202 / fallback
docker logs db90-worker        # sanitization + persist
```

---

## 9. Quick checklist (copy/paste)

```bash
# Terminal 1 — stack
cd ~/db90-rails
make up
make worker

# Terminal 2 — build + init (first time or after large pull)
cd ~/db90-rails/packages/tools
npm ci
npm run build --workspace=@db90/sdk
npm run build --workspace=@db90/telemetry-mcp

export DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=true
node db90-telemetry-mcp/dist/cli.js init \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90

# Patch ~/.claude.json (section 4) → restart Claude Code → /mcp

node db90-telemetry-mcp/dist/cli.js health
node db90-telemetry-mcp/dist/cli.js run --once
```

UI: http://localhost:5173 → Events

### Claude local-command noise backfill

If Events still show zero-token `claude_code` rows with `local-command-*` or `<command-name>` in `prompt_text`, remove historical noise (API container):

```bash
docker exec db90-api bundle exec rails 'db90:cleanup_claude_noise_events[dualboot-partners,dry_run]'
docker exec db90-api bundle exec rails 'db90:cleanup_claude_noise_events[dualboot-partners]'
```

New ingest via MCP skips these turns automatically; the rake only cleans DB rows written before the filter shipped.

---

## 10. After npm publish

You can switch back to:

```bash
npx -y @db90/telemetry-mcp init --host http://localhost:3000
```

and let `init` write the `npx` stanza in `~/.claude.json` without manual patching. Until then, this guide is the supported path for local monorepo development.

See also: [README.md](./README.md), [RELEASING.md](../RELEASING.md), [CURSOR-INGEST-VERIFICATION.md](../../../docs/data-pipeline/CURSOR-INGEST-VERIFICATION.md).

## 11. Cursor Hooks setup (opt-in)

Installs the per-turn hook forwarder so each Agent turn records the resolved model name.

```bash
cd packages/tools
npm run build --workspace=@db90/telemetry-mcp   # ensures dist/hooks/hook-forwarder.mjs is current

node db90-telemetry-mcp/dist/cli.js init --hooks
# Output: backup path + "Restart Cursor to activate"
```

1. **Restart Cursor** after install.
2. Open a Cursor Agent chat, select a model (e.g. "claude-sonnet-4-5"), and trigger a tool use.
3. Run a sync cycle:

```bash
node db90-telemetry-mcp/dist/cli.js run --once
```

4. Check health to confirm hooks fired:

```bash
node db90-telemetry-mcp/dist/cli.js health
# hooks_installed: true
# hooks_queue_depth: 0  (queue was drained)
```

5. Open DB90 Events UI → filter by `ingest_source: cursor_hook` → event should show the actual model name.

To uninstall:

```bash
node db90-telemetry-mcp/dist/cli.js uninstall-hooks
```
