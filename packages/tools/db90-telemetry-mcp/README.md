# @db90/telemetry-mcp

**stdio MCP server** for DB90: reads Claude Code JSONL transcripts, posts usage events to the ingest API, and exposes MCP tools for status, on-demand sync, and Keycloak device login.

## Credentials

Preferred: run **`db90-mcp init`** (Keycloak device flow, then **user-scoped Claude Code MCP install**) or call MCP tool **`db90_authenticate`**. Tokens are stored in the OS keychain when `keytar` is available, otherwise in `~/.db90-mcp/credentials.json` (mode `0600` on POSIX).

Manual file (fallback / CI):

```json
{
  "token": "db90_…",
  "host": "http://localhost:3000"
}
```

Environment defaults: `DB90_API_URL` (API base), `KEYCLOAK_ISSUER` / `DB90_KEYCLOAK_ISSUER` (realm issuer), `DB90_KEYCLOAK_CLIENT_ID` (default `db90-web`). Published package usage requires an explicit Keycloak issuer. For local docker-compose only, set `DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=true` to default to `http://localhost:8080/realms/db90`.

If `init` fails with **Device Authorization Grant disabled** for `db90-web`, re-import the realm (or enable “OAuth 2.0 Device Authorization Grant” on that client in Keycloak admin) so the updated `keycloak/realm-import.json` is applied.

## Build and test

From the shared tools workspace (recommended — one `package-lock.json`):

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/telemetry-mcp
npm test --workspace=@db90/telemetry-mcp
```

There is no per-package lockfile under `db90-telemetry-mcp/`; `cd packages/tools/db90-telemetry-mcp && npm ci` alone is not supported—use `packages/tools` as above.

Tests may set `DB90_MCP_HOME` to a temp directory so `~/.db90-mcp` is not touched.

## CLI

- `db90-mcp` or `db90-mcp run` — start the MCP server on stdio (what Claude Code spawns). After the stdio session connects, a **5-minute** background timer runs the same sync as `db90_sync_now`; an **immediate** sync runs once on startup when credentials exist.
- `db90-mcp run --once` — run a single sync and exit; **exit code 1** if any event failed to post.
- `db90-mcp health` — one-line diagnostic.
- `db90-mcp init [--host URL] --keycloak-url ISSUER [--tool-name claude_code|cursor] [--force]` — Keycloak device login, exchange for a DB90 ingest token, save credentials, merge **`db90`** into the **user** Claude Code MCP config file (`~/.claude.json`, top-level `mcpServers`), then exit with **`Restart Claude Code to activate`**. Use **`--force`** only if you need to replace an existing `db90` entry that differs from the `npx -y @db90/telemetry-mcp run` shape. On Windows the stored command uses `cmd /c` per Claude Code expectations for `npx`-backed stdio servers. `--keycloak-url` may be omitted when `KEYCLOAK_ISSUER` / `DB90_KEYCLOAK_ISSUER` is set or local defaults are explicitly enabled with `DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=true`.

Legacy `serve` is accepted as an alias for `run`.

## MCP tools

- **`db90_status`** — JSON: configured/authenticated flag, host, last sync time, last run counts (`sent` / `failed` / `skipped`), optional lock/rate-limit hints, recent errors. Tolerates missing or malformed credentials/state.
- **`db90_sync_now`** — runs one Claude transcript sync (advisory lock under `~/.db90-telemetry-mcp/state.lock`).
- **`db90_authenticate`** — starts Keycloak device login and returns JSON containing `verificationUri`, `verificationUriComplete`, `userCode`, `expiresIn`, and `interval`. Use `db90-mcp init` for the complete terminal flow that exchanges and saves credentials.

Session checkpoints in state files use keys `claude_code:<sessionId>` so future tools can share the same store without collisions.

## Claude Code

Per [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp), **user-scoped** servers are stored in **`~/.claude.json`** (team-shared **project** scope uses a repo-root `.mcp.json` — not written by `init`).

1. Install the package (or use `npx -y @db90/telemetry-mcp`).
2. Run `db90-mcp init ...` — this stores credentials and adds **`mcpServers.db90`** to `~/.claude.json` without removing other MCP servers or unrelated JSON keys. If a conflicting `db90` entry already exists, re-run with **`--force`**.
3. Restart Claude Code when prompted; `/mcp` should list **db90**. Call **`db90_status`** after a sync to see populated fields.

Manual `credentials.json` (under `~/.db90-mcp` or `DB90_MCP_HOME`) remains supported for CI or advanced setups; use **`claude mcp add`** if you prefer the native CLI over `init` for MCP wiring.

## License

MIT — see [LICENSE](./LICENSE).
