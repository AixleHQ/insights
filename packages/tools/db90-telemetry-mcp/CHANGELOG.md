# Changelog

All notable changes to `@db90/telemetry-mcp` will be documented in this file.

## Unreleased

- Keycloak RFC 8628 device login: `src/auth/keycloak.ts`, exchange to `POST /api/v1/integrations/mcp/exchange`, `src/auth/credentials.ts` (keytar optional + `credentials.json` fallback, `0600` on POSIX), CLI `init --host/--keycloak-url/--tool-name`, MCP tool `db90_authenticate` for device-code instructions.
- Claude transcript sync in-process (duplicated reader/pricing/risk from `@db90/claude` for publish isolation): `syncOnce` + `~/.db90-mcp` state with `claude_code:<sessionId>` keys, advisory lock file `state.lock`, `POST` via `@db90/sdk` to `/api/v1/ingest/events`.
- MCP tools: `db90_status` (live JSON from disk/telemetry), `db90_sync_now` (single sync). Stdio server runs a 5-minute timer after connect plus one startup sync when credentials exist. CLI: `db90-mcp run --once` for a single sync and non-zero exit on post failures.

## 0.1.0 — initial scaffold

- First public package scaffold for `@db90/telemetry-mcp`.
- CLI commands: `run` starts the stdio MCP server, `serve` is a legacy alias, `init` prints a `~/.claude.json` snippet, and `health` prints a process diagnostic.
- MCP tool surface starts with `db90_status`; the sync/auth/dashboard/resource surface is tracked in Unreleased until those features ship from this branch.

## API stability policy (applies from 0.1.0 forward)

- The MCP tool/resource surface is part of this package's public API.
- A breaking change to a tool's input/output shape requires a minor-version bump.
- The `~/.db90-mcp/state.json` shape is internal — do not depend on it from outside this package.

## Dependencies

- `@db90/sdk` provides the shared ingest HTTP primitive.
- Claude reader/sync code is intentionally duplicated inside `@db90/telemetry-mcp` for this phase to avoid a runtime publish-order dependency on `@db90/claude`.
