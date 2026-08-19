# CLI / MCP Server — @aixle/insights

`@aixle/insights` is the telemetry CLI and MCP server. It runs inside your AI coding tool (Claude Code, Cursor) and pushes usage events to your Aixle Insights instance.

## Installation

```bash
# One-time setup — connects to your Aixle Insights server
npx @aixle/insights init \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90
```

Or install globally: `npm install -g @aixle/insights` then run `aixle-insights init`.

## Commands

| Command | Description |
|---------|-------------|
| `run` (default) | Start the MCP stdio server — used by Claude Code automatically |
| `init` | Keycloak device login; persists ingest credentials (keychain or `~/.aixle-insights/credentials.json`) |
| `health` | Multi-line diagnostic: credentials, sync status, log path, state files |
| `uninstall-hooks` | Remove Cursor hook forwarder from `~/.cursor/hooks.json` |
| `verify-hooks` | Print Cursor hooks install status and queue depth as JSON |

### init options

| Flag | Description |
|------|-------------|
| `--host <url>` | Aixle Insights API base URL (default: `http://localhost:3000` or `DB90_API_URL`) |
| `--keycloak-url <issuer>` | Keycloak realm issuer URL |
| `--tool-name <name>` | Scope to `claude_code` or `cursor` only (default: both) |
| `--organization-id <uuid>` | Scope token to a specific org (overrides `DB90_ORGANIZATION_ID`) |
| `--force` | Replace existing `aixle-insights` MCP entry in `~/.claude.json` if it differs |
| `--hooks` | Install Cursor hook forwarder for per-turn model attribution (requires Cursor restart) |
| `--insecure` | Allow HTTP (non-TLS) hosts for local testing |

### run options

| Flag | Description |
|------|-------------|
| `--once` | Sync pending events and exit (no MCP server) |
| `--full` | With `--once`: ignore watermarks and do a full backfill |

## Credentials

Stored in the OS keychain via keytar when available; fallback: `~/.aixle-insights/credentials.json` (mode 0600 on POSIX).

## Multi-org

If you belong to more than one org, pass `--organization-id <uuid>` (or set `DB90_ORGANIZATION_ID`), or set a Default Organization in web Preferences. Single-org users need no flag. Run `aixle-insights health` to see the bound `organization_id`.

## Claude Code setup

`npx @aixle/insights init` automatically adds the server to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "aixle-insights": {
      "command": "npx",
      "args": ["-y", "@aixle/insights@latest"]
    }
  }
}
```

Restart Claude Code after init to activate.

## Cursor setup

The Cursor hook forwarder captures per-turn model attribution data. Install with:

```bash
npx @aixle/insights init --hooks \
  --host http://localhost:3000 \
  --keycloak-url http://localhost:8080/realms/db90
```

Restart Cursor to activate. To remove: `aixle-insights uninstall-hooks`.

## npm channels

| Channel | Tag | Use |
|---------|-----|-----|
| Production | `latest` | Stable releases |
| Staging | `staging` | Pre-release QA — never install in production |

```bash
npm install @aixle/insights@staging   # QA channel
```
