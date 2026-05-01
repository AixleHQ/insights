# Changelog

All notable changes to `@db90/mcp` will be documented in this file.

## Unreleased

## 0.1.0 — 2026-05-01

- First public release on npm as `@db90/mcp`.
- One-time installer: `npx -y @db90/mcp init` writes the MCP entry to `~/.claude.json`, ensures `~/.db90-mcp/config.json` exists, and runs the Keycloak device flow if the user isn't already authenticated.
- Background watcher: a 5-minute interval calls `syncOnce()` from `@db90/claude/sync` and `@db90/cursor/sync` so transcript reads and SQLite-DB reads stay in their respective packages. Single-instance advisory lock at `~/.db90-mcp/state.lock`.
- MCP tools: `db90_status`, `db90_authenticate`, `db90_sync_now`, `db90_open_dashboard`.
- MCP resources: `db90://status`, `db90://recent-sessions`, `db90://config`.
- Terminal subcommand `db90-mcp health` for diagnostics outside an editor session; exit code reflects health (0 = OK, 1 = unhealthy or unauthenticated).
- State files: `~/.db90-mcp/state.json` for MCP-specific bookkeeping (auth refresh, last-sync timestamp, error counter); per-session checkpoints stay in `~/.db90-claude/` (managed by the imported `syncOnce`).

## API stability policy (applies from 0.1.0 forward)

- The MCP tool/resource surface is part of this package's public API.
- A breaking change to a tool's input/output shape requires a minor-version bump.
- The `~/.db90-mcp/state.json` shape is internal — do not depend on it from outside this package.

## Dependencies

- `@db90/claude ^0.1.0` and `@db90/cursor ^0.1.0` for the per-tool sync logic. The orchestrator stub in 0.1.0 will be swapped to real imports once the org name is locked and Track A publishes (see `plan/tasks/10-mcp-publish.md`).
