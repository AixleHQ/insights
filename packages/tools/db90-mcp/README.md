# @db90/mcp

**stdio MCP server** for DB90: reads Claude Code JSONL transcripts, posts usage events to the ingest API, and exposes MCP tools for status and on-demand sync.

## Credentials (phase 1)

Create `~/.db90-mcp/credentials.json` (no OAuth / Keychain in this phase):

```json
{
  "token": "db90_…",
  "host": "http://localhost:3000"
}
```

## Build and test

From the shared tools workspace (recommended — one `package-lock.json`):

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/mcp
npm test --workspace=@db90/mcp
```

There is no per-package lockfile under `db90-mcp/`; `cd packages/tools/db90-mcp && npm ci` alone is not supported—use `packages/tools` as above.

Tests may set `DB90_MCP_HOME` to a temp directory so `~/.db90-mcp` is not touched.

## CLI

- `db90-mcp` or `db90-mcp run` — start the MCP server on stdio (what Claude Code spawns). After the stdio session connects, a **5-minute** background timer runs the same sync as `db90_sync_now`; an **immediate** sync runs once on startup when credentials exist.
- `db90-mcp run --once` — run a single sync and exit; **exit code 1** if any event failed to post.
- `db90-mcp health` — one-line diagnostic.
- `db90-mcp init` — prints the `~/.claude.json` snippet (does not modify files).

Legacy `serve` is accepted as an alias for `run`.

## MCP tools

- **`db90_status`** — JSON: configured/authenticated flag, host, last sync time, last run counts (`sent` / `failed` / `skipped`), optional lock/rate-limit hints, recent errors. Tolerates missing or malformed credentials/state.
- **`db90_sync_now`** — runs one Claude transcript sync (advisory lock under `~/.db90-mcp/state.lock`).

Session checkpoints in state files use keys `claude_code:<sessionId>` so future tools can share the same store without collisions.

## Claude Code

1. Install the package (or use `npx -y @db90/mcp` once published).
2. Add `credentials.json` under `~/.db90-mcp`.
3. Merge the snippet from `db90-mcp init` into `~/.claude.json` under `mcpServers`.
4. Restart Claude Code; `/mcp` should list **db90**; call **`db90_status`** after a sync to see populated fields.

## License

MIT — see [LICENSE](./LICENSE).
