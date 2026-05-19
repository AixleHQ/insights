# Changelog

All notable changes to `@db90/telemetry-mcp` will be documented in this file.

## Unreleased

- Operational **`mcp.log`** under `~/.db90-mcp` (or `DB90_MCP_HOME`) with **5 MiB** rotation to `mcp.log.1`, dependency-free (`src/log.ts`). Sync/server diagnostics use structured `mcpLog` events (retries, rate-limit pauses, lock skips, validation failures).
- Shared **`src/health.ts`** powers **`db90-mcp health`** (multi-line) and MCP **`db90_status`** via `buildHealthSnapshot()` / `healthSnapshotToStatusPayload()` — adds `log_path`, `state_file_paths`, `persisted_operator`, merges disk `mcp_operator` with in-process telemetry.
- Credential-scoped state files gain optional **`mcp_operator`** (last sync summary + `recent_errors`) persisted from `syncTelemetryTools` so failures survive process restarts.
- **`postEvent`** wraps `@db90/sdk` with **three transient retries** (1s / 4s / 16s) after failures; **429** still uses `on429` only (no retry loop). Vitest hook `setIngestRetryWaitOverrideForTests` for fast tests.
- **`resetBackoffStateForTests`** clears rate-limit backoff map between tests.

- `init` installs the **db90** MCP server into **user** Claude Code config (`~/.claude.json` → `mcpServers`): merge-only writes, idempotent when already correct, `init --force` to replace a mismatched `db90` entry; Windows uses `cmd /c npx …`. New modules under `src/install/`. Tests: `src/test/install.test.ts`.
- Keycloak RFC 8628 device login: `src/auth/keycloak.ts`, exchange to `POST /api/v1/integrations/mcp/exchange`, `src/auth/credentials.ts` (keytar optional + `credentials.json` fallback, `0600` on POSIX), CLI `init --host/--keycloak-url/--tool-name`, MCP tool `db90_authenticate` for device-code instructions.
- Claude transcript sync in-process (duplicated reader/pricing/risk from `@db90/claude` for publish isolation): `syncOnce` + `~/.db90-mcp` state with `claude_code:<sessionId>` keys, advisory lock file `state.lock`, `POST` via `@db90/sdk` to `/api/v1/ingest/events`.
- MCP tools: `db90_status` (live JSON from disk/telemetry), `db90_sync_now` (single sync). Stdio server runs a 5-minute timer after connect plus one startup sync when credentials exist. CLI: `db90-mcp run --once` for a single sync and non-zero exit on post failures.

## 0.1.0 — initial scaffold

- First public package scaffold for `@db90/telemetry-mcp`.
- CLI commands: `run` starts the stdio MCP server, `serve` is a legacy alias, `init` performs auth and (in current versions) merges MCP config into `~/.claude.json`, and `health` prints a process diagnostic.
- MCP tool surface starts with `db90_status`; the sync/auth/dashboard/resource surface is tracked in Unreleased until those features ship from this branch.

## API stability policy (applies from 0.1.0 forward)

- The MCP tool/resource surface is part of this package's public API.
- A breaking change to a tool's input/output shape requires a minor-version bump.
- The `~/.db90-mcp/state.json` shape is internal — do not depend on it from outside this package.

## Dependencies

- `@db90/sdk` provides the shared ingest HTTP primitive.
- Claude reader/sync code is intentionally duplicated inside `@db90/telemetry-mcp` for this phase to avoid a runtime publish-order dependency on `@db90/claude`.
