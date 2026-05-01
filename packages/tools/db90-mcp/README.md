# @db90/mcp

MCP server that auto-forwards Claude Code and Cursor usage telemetry to [db90](https://db90.io). One install, one login — every editor session syncs automatically.

> **Status:** scaffold — not published to npm yet. Full functionality lands across plan tasks 07 (auth), 08 (sync watcher), 09 (tools/resources), and 10 (publish). The release workflow excludes `cli-mcp-v*` tags until Task 10 wires the real sync to `@db90/claude` and `@db90/cursor`; until then `runClaudeSync` and `runCursorSync` in [`src/sync.ts`](src/sync.ts) are stubs that return zero counts.

## Install

```bash
npx @db90/mcp init      # registers the MCP entry in Claude Code / Cursor
npx @db90/mcp           # serves stdio (auto-invoked by your editor)
npx @db90/mcp health    # diagnostic snapshot from a regular terminal
```

After install, the on-disk command is `db90-mcp`.

## State files

- `~/.db90-mcp/state.json` — MCP-specific state: auth refresh metadata, last-sync timestamp, error counter.
- `~/.db90-mcp/mcp.log` — append-only log file, rotated at 5 MB.
- `~/.db90-mcp/credentials.json` (fallback) — used when `keytar` is unavailable; chmod 0600.

Per-session checkpoints for Claude Code transcripts live at `~/.db90-claude/state-<host>-<hash>.json` and are managed by `@db90/claude/sync` (shared with the standalone CLI by design — natural migration).

## License

MIT — see [LICENSE](./LICENSE).
