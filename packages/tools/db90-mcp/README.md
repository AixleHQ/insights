# @db90/mcp

Phase-0 **stdio MCP server**: a single tool, `db90_status`, returns a static JSON placeholder (no network, no auth). Intended as the Claude Code round-trip baseline before sync and richer tooling.

## Build and test

From the shared tools workspace (recommended — one `package-lock.json`):

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/mcp
npm test --workspace=@db90/mcp
```

There is no per-package lockfile under `db90-mcp/`; `cd packages/tools/db90-mcp && npm ci` alone is not supported—use `packages/tools` as above.

## CLI

- `db90-mcp` or `db90-mcp run` — start the MCP server on stdio (what Claude Code spawns).
- `db90-mcp health` — one-line diagnostic.
- `db90-mcp init` — prints the `~/.claude.json` snippet below (does not modify files).

Legacy `serve` is accepted as an alias for `run`.

## Claude Code

1. `npm install -g` from this package (or use `npx -y @db90/mcp` once published).
2. Merge the snippet from `db90-mcp init` into `~/.claude.json` under `mcpServers`.
3. Restart Claude Code; `/mcp` should list **db90**; call **`db90_status`** — you should see:

```json
{
  "authenticated": false,
  "host": null,
  "last_sync_at": null,
  "sessions_synced": 0,
  "errors": []
}
```

## License

MIT — see [LICENSE](./LICENSE).
