# Changelog

All notable changes to `@db90/telemetry-mcp` will be documented in this file.

## [0.1.0] - 2026-05-19

First public npm release (`@db90/telemetry-mcp@0.1.0`): stdio MCP server for DB90 with Claude Code + Cursor ingestion, Keycloak/OIDC device login, bundled private `@db90/sdk`.

### Highlights

- **Init & auth**: Keycloak RFC 8628 device login (`src/auth/keycloak.ts`), exchange to `POST /api/v1/integrations/mcp/exchange`, `src/auth/credentials.ts` with optional OS keychain (`keytar`) and `credentials.json` fallback (`0600` on POSIX). CLI `init --host/--keycloak-url/--tool-name/--force`; MCP tool **`db90_authenticate`** for device-code JSON.
- **Claude Code wiring**: `init` merges the **`db90`** MCP server into **user** config **`~/.claude.json`** → `mcpServers` (`src/install/`). Omit **`--tool-name`** so provisioning can attach both **`claude_code`** and **`cursor`** when eligible. **`--tool-name cursor`** skips Claude MCP install. **`--force`** replaces a conflicting existing `db90` entry. Windows uses `cmd /c npx …` per Claude expectations.
- **Sync & ingest**: Claude JSONL transcript sync in-process (`syncOnce`, state keys `claude_code:<sessionId>`), Cursor SQLite readers, advisory lock **`state.lock`**, posts via **`@db90/sdk`** to **`POST /api/v1/ingest/events`**. MCP tools **`db90_status`**, **`db90_sync_now`**, **5‑minute** background timer plus startup sync when credentials exist. CLI **`db90-mcp run --once`** for single sync / non-zero exit on failures.
- **Resilience & observability**: Shared **`src/health.ts`** for **`db90-mcp health`** and MCP **`db90_status`**. Operational **`mcp.log`** (~/.db90-mcp, `DB90_MCP_HOME` override), **5 MiB** rotate to **`mcp.log.1`**. Credential-scoped state **`mcp_operator`** diagnostics. **`postEvent`** retries (1s / 4s / 16s) on transient failures; **429** uses backoff helper only.

### Packaging

- **Bundled `@db90/sdk`** via **`prepack` → `packages/tools/scripts/stage-sdk-bundle.mjs`** and **`bundledDependencies`**, so published tarballs remain installable while the SDK stays private on npm.

## API stability policy (applies from 0.1.0 forward)

- The MCP tool/resource surface is part of this package's public API.
- A breaking change to a tool's input/output shape requires a minor-version bump.
- The `~/.db90-mcp/state.json` shape is internal — do not depend on it from outside this package.

## Dependencies

- `@db90/sdk` provides the shared ingest HTTP primitive (bundled in the published tarball).
- Claude reader/sync code is intentionally duplicated inside `@db90/telemetry-mcp` for publish isolation.
