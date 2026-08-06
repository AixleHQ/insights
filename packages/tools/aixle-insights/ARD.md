# @aixle/insights ARD

Architecture Reference Document for the `@aixle/insights` npm package.

## 1) Purpose

`@aixle/insights` is a local-first telemetry connector that:

- collects AI coding-assistant activity from Claude Code and Cursor,
- normalizes events into Aixle Insights ingest payloads,
- and exposes operational controls through an MCP stdio server.

The package is designed so a teammate can run a single `init` flow and then rely on background sync, instead of custom cron jobs, shell scripts, or manual exports.

## 2) Product Scope

### In scope

- CLI workflows (`init`, `run`, `run --once`, `health`, hooks install/uninstall/verify).
- MCP tools:
  - `aixle_insights_status`
  - `aixle_insights_sync_now`
  - `aixle_insights_authenticate`
  - Deprecated aliases (removed in a later release, AIX-569): `db90_status`, `db90_sync_now`, `db90_authenticate`
- Multi-source ingestion:
  - Claude transcript JSONL files
  - Cursor SQLite stores (`state.vscdb`, legacy `cursor.db`)
  - Cursor agent transcript files
  - Optional Cursor hook queue (`hooks-queue.ndjson`)
- Credential lifecycle via Keycloak Device Flow and Aixle Insights MCP token exchange.
- Local state management (checkpoints, lock, retry/backoff, diagnostics).

### Out of scope

- Aixle Insights backend processing/storage internals after `POST /api/v1/ingest/events`.
- UI/reporting concerns.
- Server-side auth policies (handled by Aixle Insights API + Keycloak).

## 3) High-Level Architecture

### Runtime layers

1. **Entry layer** (`src/cli.ts`)
   - Parses command arguments.
   - Executes one-shot flows (`init`, `health`, `run --once`) or starts MCP server (`run`).

2. **MCP layer** (`src/server.ts`)
   - Registers `aixle_insights_*` tools on stdio transport (plus deprecated `db90_*` aliases, AIX-569).
   - Runs startup sync and periodic background sync loop.

3. **Sync orchestration** (`src/sync.ts`)
   - Coordinates multi-tool sync under advisory lock.
   - Applies checkpointing, dedupe, backoff, and posting.
   - Persists operator diagnostics into credential-scoped state files.

4. **Source adapters**
   - Claude reader/mapper (`src/readers/claude.ts`).
   - Cursor readers/mappers (`src/readers/cursor.ts`, `src/collect-cursor-payloads.ts`).
   - Cursor hooks queue reader (`src/hooks/cursor-hooks-reader.ts`).

5. **Platform services**
   - Auth + credential persistence (`src/auth/*`, `src/credentials.ts`).
   - State + lock + logs (`src/state.ts`, `src/lock.ts`, `src/log.ts`).
   - HTTP posting + retries (`src/lib/client.ts`, `src/client.ts`).
   - Health snapshot (`src/health.ts`).
   - Installer flows (`src/install/claude.ts`, `src/hooks/hooks-config.ts`).

### Data flow

1. `init` performs Keycloak device authorization and exchanges for ingest token(s).
2. Credentials are saved in keychain when available, otherwise in `~/.aixle-insights/credentials.json` (mode 0600 on POSIX).
3. `run` starts MCP server and background sync.
4. Sync reads local sources, maps payloads, and posts to Aixle Insights ingest API.
5. Checkpoints/watermarks/state are persisted per credential (`state-<hostname>-<token-hash>.json`) to avoid duplicate sends.
6. Diagnostics are surfaced through `health`/`aixle_insights_status` and `mcp.log`.

## 4) Core Decisions

### A. Multi-tool credentials in one host namespace

- Stored shape is `version: 2` with `accounts` keyed by `claude_code` and `cursor`.
- Supports one auth session that provisions multiple ingest tokens.
- Keeps backwards compatibility with legacy single-token shape.

### B. Credential-scoped state files

- State is partitioned by host + token hash.
- Prevents collisions across orgs/environments/accounts.
- Preserves migration from old `state.json`.

### C. Local lock for overlapping sync protection

- Advisory `state.lock` in app dir guards against concurrent intervals/manual sync/parallel processes.
- Stale lock handling includes owner liveness checks.

### D. Best-effort delivery with resilient retries

- Per-event transient retries for 5xx/network (`1s`, `4s`, `16s`).
- 429 handling persists `rate_limited_until` so pause survives process restarts.
- Batch partial failures are tolerated and explicitly logged.

### E. Security-oriented packaging/publishing gates

- OIDC trusted publishing (no long-lived npm token by default).
- CI release workflow blocks unsafe lifecycle scripts, local dependency specs, and scope regressions.
- `npm ci --ignore-scripts` + targeted `npm rebuild better-sqlite3` reduces supply-chain risk.

## 5) Build and Test Architecture

### Local build

- Workspace: `packages/tools`.
- Package build command:
  - `npm run build --workspace=@aixle/insights`
- Build steps:
  1. TypeScript compile (`tsc`) from `src` to `dist`.
  2. Explicit copy of `src/hooks/hook-forwarder.mjs` to `dist/hooks/hook-forwarder.mjs`.

### Test strategy

- Test runner: Vitest (`npm test --workspace=@aixle/insights`).
- Coverage focus:
  - CLI argument behavior and init flows,
  - auth exchange and credential storage,
  - readers/mappers and payload contract checks,
  - sync orchestration and retry/backoff logic,
  - hook config/queue behavior and install paths.

### CI lanes

- Linux build + test for package.
- Windows install/build smoke for native dependency (`better-sqlite3`) path.

## 6) Release Architecture

- Release trigger: tag `cli-mcp-vX.Y.Z` (or guarded manual dispatch).
- Working directory: `packages/tools/aixle-insights`.
- Hard gates include:
  - tag version equals `package.json` version,
  - package source free of legacy/placeholder scope identifiers,
  - no `file:`/`link:` dependencies in publishable sections,
  - only `prepublishOnly` lifecycle script allowed,
  - explicit `publishConfig.provenance: false` while source repo remains private,
  - signed dependency verification + pack allowlist (`dist/**`, `README.md`, `LICENSE`, `package.json`).

Reference runbook: `packages/tools/RELEASING.md`.

## 7) Operational Reference

- App dir default: `~/.aixle-insights` (override `AIXLE_INSIGHTS_HOME`).
- Core files:
  - credentials: keychain or `credentials.json`
  - state: `state-<hostname>-<token-hash>.json`
  - lock: `state.lock`
  - logs: `mcp.log` and `mcp.log.1` rotation
  - optional queue: `hooks-queue.ndjson`
- Health surfaces:
  - CLI: `aixle-insights health`
  - MCP: `aixle_insights_status`

## 8) Known Trade-offs and Current Direction

### Trade-offs

- Cursor line-based daily stats are estimates, not exact token accounting.
- Multi-model session handling can still involve approximations in cost attribution.
- Legacy Cursor data paths remain for compatibility and may be empty on many installs.

### Direction

1. Keep install path simple (`npx ... init`) while preserving strict security gates.
2. Continue reducing duplicate counting across Cursor paths as transcript coverage expands.
3. Improve attribution fidelity (workspace/project/model) without adding heavy user configuration.
4. Maintain backwards compatibility for existing local state/credential installs where practical.

## 9) Source Map (Quick Navigation)

- CLI entry: `src/cli.ts`
- MCP server/tools: `src/server.ts`
- Sync engine: `src/sync.ts`
- Cursor payload preparation: `src/collect-cursor-payloads.ts`
- Claude reader/mapper: `src/readers/claude.ts`
- Cursor readers/mappers: `src/readers/cursor.ts`
- Cursor SQLite security helper (readonly open + path containment): `src/readers/cursor-sqlite.ts`
- Auth flow: `src/auth/flow.ts`, `src/auth/keycloak.ts`, `src/auth/exchange.ts`
- Credentials: `src/auth/credentials.ts`
- State/lock/log: `src/state.ts`, `src/lock.ts`, `src/log.ts`
- Installer/hook config: `src/install/claude.ts`, `src/hooks/hooks-config.ts`
- Health model: `src/health.ts`
- Release workflow: `.github/workflows/release-cli.yml`
