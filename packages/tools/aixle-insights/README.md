# @aixle/insights

stdio **MCP server** for AI coding-assistant telemetry. Ingests Claude Code JSONL transcripts and Cursor IDE SQLite telemetry into your organization's ingest API, exposes operator tools on the MCP bridge, and pairs with `aixle-insights init` so teammates can onboard without juggling cron jobs or brittle shell hooks.

## Install

```bash
# One-shot via npx (recommended — always pulls the latest):
npx -y @aixle/insights init \
  --host https://YOUR-API-HOST \
  --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM

# Or global install:
npm i -g @aixle/insights
aixle-insights init --host https://YOUR-API-HOST --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM
```

`init` performs a Keycloak device login, stores credentials locally (OS keychain via `keytar` when available, otherwise `~/.aixle-insights/credentials.json` mode 0600), and merges the MCP server entry into `~/.claude.json` under `mcpServers.aixle-insights`.

After `init` succeeds:

1. **Restart Claude Code** — it discovers the new MCP server on the next launch.
2. Open Claude Code; confirm `/mcp` lists **aixle-insights**.
3. During a Claude session invoke the **`db90_status`** MCP tool (or `aixle-insights health` from the shell) to see connectivity + last sync metadata.

## Multi-org

If your account has several organization memberships, `init` mints ingest tokens for the **oldest** membership unless you scope to a different org:

```bash
npx -y @aixle/insights init \
  --host https://YOUR-API-HOST \
  --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM \
  --organization-id <uuid>
```

You can also set `DB90_ORGANIZATION_ID=<uuid>` in your shell environment, or pin it via `mcpServers.aixle-insights.env` in `~/.claude.json`. The CLI flag overrides the env var when both are set.

## Commands

| Command | What it does |
|---|---|
| `aixle-insights run` | Start the MCP stdio server (the default; spawned by Claude Code on demand). |
| `aixle-insights run --once` | Perform one multi-tool sync, exit. Useful for cron / manual flushes. |
| `aixle-insights run --once --full` | Backfill: ignore Cursor watermarks and commit-hash dedupe. |
| `aixle-insights init` | Keycloak device login + persist credentials + merge `~/.claude.json` entry. |
| `aixle-insights init --hooks --tool-name cursor` | Also install the Cursor-side hook forwarder (opt-in; requires Cursor restart). |
| `aixle-insights uninstall-hooks` | Remove the hook forwarder + restore `~/.cursor/hooks.json` backup. |
| `aixle-insights verify-hooks` | Print hooks install status + queue depth as JSON. |
| `aixle-insights health` | Multi-line diagnostic (credentials, sync, log path, state files). |

## Environment

| Variable | Purpose |
|---|---|
| `DB90_API_URL` | API origin for ingestion + MCP exchange (defaults to `http://localhost:3000`; `init --host` overrides). |
| `KEYCLOAK_ISSUER` / `DB90_KEYCLOAK_ISSUER` | Realm issuer URLs (preferred on servers + CI). |
| `DB90_KEYCLOAK_CLIENT_ID` | Defaults to `db90-web`; must allow device authorization in Keycloak. |
| `DB90_ORGANIZATION_ID` | Optional UUID scoping `init` to that org membership (header `X-Organization-ID`). |
| `AIXLE_INSIGHTS_HOME` | Override the local state directory (defaults to `~/.aixle-insights/`). |

Note: the `DB90_*` variables above are retained as compatibility names for the deployment-side Keycloak realm/client identifiers. Future versions may rename them with a deprecation window.

Optional `~/.aixle-insights/config.json` accepts Cursor line-cost overrides (per-model rates):

```json
{
  "cursor": {
    "line_costs": {
      "claude-sonnet-4-5": { "input_per_line": 0.0002, "output_per_line": 0.0008 }
    }
  }
}
```

## Cursor hook forwarder (opt-in)

`aixle-insights init --hooks --tool-name cursor` installs a Node script as a Cursor hook (`~/.cursor/hooks.json`). The script appends redacted hook payloads to `~/.aixle-insights/hooks-queue.ndjson`; the background sync drains the queue on its next cycle and POSTs the events with accurate per-turn model attribution. Requires a Cursor restart after install. To remove, run `aixle-insights uninstall-hooks` and restart Cursor again.

## State + credentials

- **App home directory**: `~/.aixle-insights/` (override with `AIXLE_INSIGHTS_HOME`).
- **Credentials**: OS keychain via `keytar` when available (service: `aixle-insights`); fallback file `~/.aixle-insights/credentials.json` with mode 0600 on POSIX.
- **State files**: `state-<hostname>-<token-hash>.json` per credential, plus `state.lock` advisory lock, `mcp.log` rotating diagnostic log, optional `hooks-queue.ndjson`.

The internal state-file shape is implementation-detail; don't depend on it from outside this package.

## Diagnostics

```bash
aixle-insights health        # connectivity + last sync metadata
aixle-insights verify-hooks  # JSON: hooks installed + queue depth
```

`mcp.log` (rotates at 5 MiB to `mcp.log.1`) under the app home directory captures operational events. Inside Claude Code, the **`db90_status`** MCP tool returns the same diagnostic structure as `aixle-insights health`.

## Local development — `/aixle-reset` skill

> Audience: contributors editing this package. If you installed `@aixle/insights` from npm and aren't modifying the source, you can skip this section.

When you iterate on `src/` against a real Claude Code or Cursor session, the running MCP routinely drifts out of sync with the code you just wrote. Common causes:

- Rebuilt `dist/` but never restarted the long-lived MCP process — your changes aren't in memory.
- `~/.claude.json` accumulated both `mcpServers.insights` and `mcpServers.aixle-insights` (or a legacy `mcpServers.db90`), and Claude Code spawned the wrong one.
- The MCP launched from a non-git-rooted `cwd` (e.g. `~/`), so pre-resolution returned `project_id: null` and every turn in that session inherited it.

The repo ships a Claude Code skill, **`/aixle-reset`** (lives at `.claude/skills/aixle-reset/SKILL.md`), that restores known-good local state in one shot.

It runs `scripts/reset-local-env.mjs`, which:

1. Stops any running `aixle-insights/dist/cli.js run` process.
2. Rebuilds `dist/` if anything in `src/` is newer.
3. Repairs `~/.claude.json` and `~/.cursor/mcp.json` so the entries point at `node <abs path>/dist/cli.js run`, stripping duplicate `insights` and legacy `db90` keys. Backs up each file it modifies.
4. Warns non-blockingly about leftover direct-curl ingest hooks in `~/.claude/settings.json` and stale `@db90/*` npm globals.
5. Restarts the MCP from the repo root so pre-resolution finds the project from `git remote`.
6. Waits up to 30 s for the first `project_attribution_resolved` log line and asserts `project_id` is non-null.

Invoke manually:

```bash
node packages/tools/aixle-insights/scripts/reset-local-env.mjs
```

Or, inside Claude Code, run the **`/aixle-reset`** skill.

A `PostToolUse` hook (`.claude/hooks/on-aixle-insights-edit.ts`) **suggests** running the skill whenever you edit a file under `packages/tools/aixle-insights/**` (excluding `dist/`, `*.md`, and any test path). The hook is advisory only — it never auto-executes, so you can iterate freely and reset when you're ready to test end-to-end.

After the script reports success: **quit and reopen Claude Code / Cursor** so each IDE re-spawns its own MCP from the now-canonical config. The MCP the script started manually keeps running standalone and will still sweep transcripts correctly until you replace it.

## Requirements

- Node.js ≥ 20.
- macOS / Linux / Windows. On Windows, the package writes a `cmd /c npx …` wrapper in `~/.claude.json` so Claude Code can spawn the MCP server reliably.

## License

MIT.
