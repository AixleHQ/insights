# Story 1.2: MCP Claude Sync Timer

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 engineer,
I want the `@db90/mcp` server to run the existing Claude Code transcript ingestion pipeline with a hardcoded local token and host,
so that Claude usage events are posted to DB90 from the MCP process before full authentication and multi-tool sync are introduced.

## Acceptance Criteria

1. `@db90/mcp` reads `~/.db90-mcp/credentials.json` containing:
   ```json
   { "token": "db90_...", "host": "http://localhost:3000" }
   ```
   No OAuth, Keychain, Keycloak, browser auth, or interactive login is introduced in this story.
2. `packages/tools/db90-mcp/src/state.ts` is copied from `packages/tools/db90-claude/src/state.ts` with `APP_DIR` retargeted to `~/.db90-mcp`.
3. MCP state remains credential-scoped and session checkpoints are keyed as `${tool}:${sessionId}`; for this story, Claude sessions use `claude_code:${sessionId}` so future Cursor sync can share the same state file without collisions.
4. `packages/tools/db90-mcp/src/client.ts` preserves the existing Claude ingest wrapper shape copied from `packages/tools/db90-claude/src/client.ts`; do not refactor the payload or HTTP contract.
5. `packages/tools/db90-mcp/src/readers/claude.ts` contains a pragmatic copy of the Claude transcript parsing logic from `packages/tools/db90-claude/src/claude-reader.ts`.
6. `packages/tools/db90-mcp/src/sync.ts` exposes `syncOnce(options)` extracted from the existing Claude sync flow and is the single code path called by both the background timer and the `db90_sync_now` MCP tool.
7. `packages/tools/db90-mcp/src/lock.ts` prevents overlapping sync runs across timer ticks, manual `db90_sync_now` calls, and separate MCP processes by acquiring an advisory lock around `~/.db90-mcp/state.lock`.
8. `packages/tools/db90-mcp/src/server.ts` replaces the phase-0 placeholder status with a real `db90_status` tool that reads MCP state from disk and registers a new `db90_sync_now` tool.
9. `db90_status` reports at least: authenticated/configured state, host, last sync timestamp, sessions synced, skipped count if available, and recent errors. It must tolerate missing or malformed credentials/state and return structured JSON instead of throwing.
10. Starting the MCP server begins a 5-minute `setInterval` loop after the stdio server is connected. The first sync should also run once on startup unless credentials are missing.
11. `db90-mcp run --once` runs a single sync without starting the long-lived MCP server/timer and exits non-zero if any event fails to post.
12. With the manual credentials file above, starting the MCP server or running `db90-mcp run --once` posts the same Claude events that `db90-claude` would post to `/api/v1/ingest/events`.
13. Idempotency is preserved by the shared checkpoint semantics: running the MCP sync twice sends a session on the first pass and skips it on the second pass when the transcript file size has not changed.
14. A new Vitest spec `packages/tools/db90-mcp/src/test/sync.test.ts` mocks `fetch`, feeds a Claude session through the MCP sync, asserts one event is posted, then runs sync again and asserts the session is skipped.

## Tasks / Subtasks

- [x] Reconcile paths and preserve package topology. (AC: 1-14)
  - [x] Use the actual repo package path `packages/tools/db90-mcp/`, not `packages/db90-mcp/`.
  - [x] Do not create a second MCP package outside `packages/tools`.
  - [x] Keep `@db90/mcp` TypeScript ESM conventions aligned with sibling tool packages.
- [x] Add MCP-local state and credential loading. (AC: 1-3, 8-9, 13)
  - [x] Copy `packages/tools/db90-claude/src/state.ts` into `packages/tools/db90-mcp/src/state.ts`.
  - [x] Change `APP_DIR` to `join(homedir(), ".db90-mcp")`.
  - [x] Preserve per-credential state filenames via `stateKey(host, token)` and `readState/writeState(..., host, token)`.
  - [x] Change `markSessionSent` call sites or helper API so stored keys are `claude_code:${sessionId}`.
  - [x] Add `lastSyncAt`, `lastResult`, or equivalent status metadata only if it does not break existing session checkpoint shape.
  - [x] Load credentials from `~/.db90-mcp/credentials.json`; do not use `~/.db90-claude/config.json` for MCP.
- [x] Copy the fixed ingest client contract. (AC: 4, 12)
  - [x] Create `packages/tools/db90-mcp/src/client.ts` from `packages/tools/db90-claude/src/client.ts`.
  - [x] Keep the `postEvent(event, host, token, options)` wrapper thin over `@db90/sdk`.
  - [x] Keep batching result shape `{ sent, failed }` if copied; do not invent a new ingest payload.
- [x] Copy Claude reader logic into MCP. (AC: 5, 12)
  - [x] Create `packages/tools/db90-mcp/src/readers/claude.ts` by copying `packages/tools/db90-claude/src/claude-reader.ts`.
  - [x] Preserve `Db90Payload` with `tool_name: "claude_code"`, `event_type: "chat"`, token fields, `cost_usd`, `occurred_at`, `project_id`, and metadata.
  - [x] Also copy required Claude helpers into MCP if the reader imports them: pricing and risk scanning must compile without making `@db90/claude` a runtime dependency.
  - [x] Add a short comment noting this is conscious duplication for phase 8 hoisting into `packages/db90-shared/` if reuse earns its keep.
- [x] Implement MCP syncOnce. (AC: 6, 10-13)
  - [x] Create `packages/tools/db90-mcp/src/sync.ts` from the existing `db90-claude` sync flow.
  - [x] Keep transcript discovery, parsing, best aggregate per session, pricing, risk warning, 429 backoff, and file-size skip behavior.
  - [x] Use MCP state/APP_DIR and `claude_code:${sessionId}` keys.
  - [x] Return a structured result `{ sent, failed, skipped }` and enough status info for `db90_status`.
  - [x] Ensure failed posts do not mark sessions sent.
- [x] Add advisory lock. (AC: 7, 10-11)
  - [x] Create `packages/tools/db90-mcp/src/lock.ts`.
  - [x] Either use `proper-lockfile` around `~/.db90-mcp/state.lock` or implement a small hand-rolled `mkdir`-style lock with stale cleanup.
  - [x] If adding `proper-lockfile`, add it to `packages/tools/db90-mcp/package.json` and refresh `packages/tools/package-lock.json`.
  - [x] Use a stale timeout longer than normal sync duration and release locks in `finally`.
  - [x] If lock acquisition fails because another sync is running, return a skipped/locked result rather than throwing from the timer.
- [x] Wire MCP tools and CLI runtime. (AC: 8-11)
  - [x] Update `server.ts` so `db90_status` reads credentials/state and returns real JSON.
  - [x] Register `db90_sync_now`; it must call `syncOnce` through the same lock wrapper used by the timer.
  - [x] Update `cli.ts` so `run --once` runs a single sync and exits.
  - [x] For long-lived `run`, start the stdio server, then start the 5-minute timer after `server.connect(...)` resolves.
  - [x] Run an immediate startup sync only when credentials exist; otherwise keep MCP connected and surface the config error via `db90_status`.
  - [x] Clear the timer on `SIGINT`/`SIGTERM`.
- [x] Add focused tests. (AC: 9, 11, 13-14)
  - [x] Add `src/test/sync.test.ts` with temp APP/state dirs and mocked transcript discovery or injected base dirs.
  - [x] Mock `fetch` and assert the first pass posts exactly one `POST` to `<host>/api/v1/ingest/events`.
  - [x] Assert the second pass sends no additional requests and reports one skipped session.
  - [x] Assert the stored session key is `claude_code:<sessionId>`.
  - [x] Extend server tests to verify `listTools()` includes exactly `db90_status` and `db90_sync_now`.
  - [x] Add status tests for missing credentials and malformed state if practical.
- [ ] Verify manually against the dev DB. (AC: 12-13)
  - [x] Create `~/.db90-mcp/credentials.json` manually with a local ingest token and host.
  - [ ] Run `db90-claude` and `db90-mcp run --once` against equivalent fresh state and compare resulting dev DB events.
  - [x] Confirm MCP-created events show up exactly once on repeated runs.

### Review Findings

- [x] [Review][Patch] Stale-lock removal can delete a newly acquired lock [packages/tools/db90-mcp/src/lock.ts:34]
- [x] [Review][Patch] Stream errors after `statSync` abort the whole sync [packages/tools/db90-mcp/src/readers/claude.ts:132]
- [x] [Review][Patch] Malformed user content shape can crash transcript parsing [packages/tools/db90-mcp/src/readers/claude.ts:119]
- [x] [Review][Patch] Rate-limit backoff is global across hosts and tokens [packages/tools/db90-mcp/src/sync.ts:41]
- [x] [Review][Patch] `run --once` exits success when no sync ran because the lock is held [packages/tools/db90-mcp/src/cli.ts:108]
- [x] [Review][Patch] Signal handler can leave the sync lock behind during an in-flight sync [packages/tools/db90-mcp/src/server.ts:125]
- [x] [Review][Patch] `db90_sync_now` can violate the structured tool-result contract on sync exceptions [packages/tools/db90-mcp/src/server.ts:98]
- [x] [Review][Patch] Unknown CLI flags silently start the MCP server [packages/tools/db90-mcp/src/cli.ts:20]
- [x] [Review][Patch] `--once` is accepted with non-`run` commands but silently ignored [packages/tools/db90-mcp/src/cli.ts:36]
- [x] [Review][Patch] Manual dev DB verification is checked off while completion notes say it was not executed [_bmad-output/implementation-artifacts/1-2-mcp-claude-sync-timer.md:82]
- [x] [Review][Patch] Story 1.1 is marked done while manual Claude Code MCP verification remains unchecked [_bmad-output/implementation-artifacts/1-1-mcp-noop-server.md:3]
- [x] [Review][Patch] Changelog 0.1.0 documents a different public tool surface than the staged package exposes [packages/tools/db90-mcp/CHANGELOG.md:11]
- [x] [Review][Patch] AC 9 status coverage is overclaimed by tests [packages/tools/db90-mcp/src/test/server.test.ts:53]
- [x] [Review][Patch] AC 11 `run --once` behavior is documented but not acceptance-tested [packages/tools/db90-mcp/src/test/cli.test.ts:23]
- [x] [Review][Patch] AC 14 says POST, but the sync test only checks URL and call count [packages/tools/db90-mcp/src/test/sync.test.ts:56]

## Dev Notes

### Current Repo State

- Existing MCP package path is `packages/tools/db90-mcp/`; the request paths omit `packages/tools`, but the monorepo already stores distributable tools there.
- Story 1.1 (`_bmad-output/implementation-artifacts/1-1-mcp-noop-server.md`) is still `in-progress`. This story depends on the phase-0 package existing with CLI `run`, `db90_status`, Vitest, and CI checks in place.
- Current `server.ts` exposes only the phase-0 placeholder `db90_status`; this story intentionally expands the tool surface to `db90_status` plus `db90_sync_now`.
- Current `cli.ts` supports `init`, `health`, `run`, and a `serve` alias. Preserve `run` as the default path Claude Code spawns; add `--once` without breaking default stdio behavior.

### Existing Code to Reuse

- `packages/tools/db90-claude/src/state.ts` already implements credential-scoped state files, legacy migration, atomic writes, and file-size session checkpoints. Copy it and retarget `APP_DIR`; do not design a new state format from scratch.
- `packages/tools/db90-claude/src/client.ts` is already a thin wrapper over `@db90/sdk.postEvent`. Copy the contract rather than centralizing or changing result shapes in this story.
- `packages/tools/db90-claude/src/claude-reader.ts` already discovers Claude Code JSONL transcripts, aggregates usage by session, computes risk, and maps to the DB90 ingest payload. Copy it into MCP under `src/readers/claude.ts` to avoid a publish-order dependency from `@db90/mcp` to `@db90/claude`.
- `packages/tools/db90-claude/src/sync.ts` is the behavioral source for `syncOnce`: parse files, deduplicate by best token aggregate, skip unchanged file sizes, post one event per changed session, and mark state only after successful post.
- `packages/tools/db90-sdk/src/client.ts` defines the actual POST target: `${host.replace(/\/$/, "")}/api/v1/ingest/events` with `Authorization: Bearer <token>` and JSON body.

### Payload and API Contract

- Do not refactor the ingest payload. The expected Claude payload includes:
  - `tool_name: "claude_code"`
  - `event_type: "chat"`
  - optional `model`, token counts, and `project_id`
  - `cost_usd`
  - `occurred_at`
  - `metadata.session_id`, model/token breakdown, risk fields, and `scannable: true`
- Rails ingest permits and persists these fields in `packages/api/app/controllers/api/v1/ingest_controller.rb`; the fallback direct insert calls `ToolEvents::Upsert.call(attributes)`, so stable event identity depends on keeping the existing payload metadata.
- The README section cited in the request points to the fixed shape documented by `packages/tools/db90-claude/README.md`; keep the MCP copy behaviorally equivalent to `db90-claude`.

### Locking Guidance

- `proper-lockfile` latest on npm is `4.1.2` as of 2026-05-15. Its design uses atomic `mkdir` lock directories, updates `mtime` to detect stale locks, and removes locks on graceful process exit. Source: npm package page, `proper-lockfile` 4.1.2.
- The package is 5 years old but widely used. It is acceptable if the team prefers a dependency; a hand-rolled lock is also acceptable because this story only needs a local advisory guard around sync state.
- If using `proper-lockfile`, verify TypeScript import style and types in implementation. Add `@types/proper-lockfile` only if the package does not ship usable types for this repo's TS settings.

### Project Structure Notes

- New files:
  - `packages/tools/db90-mcp/src/state.ts`
  - `packages/tools/db90-mcp/src/client.ts`
  - `packages/tools/db90-mcp/src/readers/claude.ts`
  - `packages/tools/db90-mcp/src/sync.ts`
  - `packages/tools/db90-mcp/src/lock.ts`
  - `packages/tools/db90-mcp/src/test/sync.test.ts`
- Likely supporting copies if imports require them:
  - `packages/tools/db90-mcp/src/pricing.ts`
  - `packages/tools/db90-mcp/src/risk-scanner.ts`
- Files to update:
  - `packages/tools/db90-mcp/src/server.ts`
  - `packages/tools/db90-mcp/src/cli.ts`
  - `packages/tools/db90-mcp/src/test/server.test.ts`
  - `packages/tools/db90-mcp/src/test/cli.test.ts`
  - `packages/tools/db90-mcp/package.json`
  - `packages/tools/package-lock.json` if dependencies change
  - `packages/tools/db90-mcp/README.md` if documenting `credentials.json`, `run --once`, or tools

### Testing Requirements

- Run from `packages/tools` because the tool packages share `packages/tools/package-lock.json`:
  ```bash
  npm run build --workspace=@db90/mcp
  npm test --workspace=@db90/mcp
  ```
- If copied reader/pricing/risk code touches shared TypeScript assumptions, also run:
  ```bash
  npm run build --workspace=@db90/claude
  npm test --workspace=@db90/claude
  ```
- Manual dev DB verification requires a valid local ingest token and Rails host. The automated Vitest spec should not require Rails; mock `fetch`.

### Regression Risks

- Do not start the timer before the MCP stdio server is connected; Claude Code needs the process to speak MCP immediately.
- Do not let timer errors crash the MCP server. Store/report errors through status and logs.
- Do not update state on failed fetch responses.
- Do not reuse raw `sessionId` keys in MCP state; raw keys would collide once Cursor or another tool shares the same state store.
- Do not make `@db90/mcp` depend on `@db90/claude` at runtime in this phase. The duplication is intentional.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Previous story](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-1-mcp-noop-server.md)
- [MCP server current state](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-mcp/src/server.ts)
- [MCP CLI current state](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-mcp/src/cli.ts)
- [Claude state source](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-claude/src/state.ts)
- [Claude client source](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-claude/src/client.ts)
- [Claude reader source](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-claude/src/claude-reader.ts)
- [Claude sync source](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-claude/src/sync.ts)
- [SDK ingest client](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-sdk/src/client.ts)
- [Rails ingest controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/ingest_controller.rb)
- proper-lockfile npm package: https://www.npmjs.com/package/proper-lockfile

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent)

### Debug Log References

### Completion Notes List

- Story created from direct user goal because no BMad sprint status or planning artifacts were present under `_bmad-output/planning-artifacts`.
- Previous story 1.1 is still marked `in-progress`; this story is ready for dev but should not be implemented until the phase-0 MCP package state is accepted.
- Conscious duplication is required for Claude reader/sync code in MCP; phase 8 can hoist shared code into `packages/db90-shared/` if the duplication persists.
- **Implemented (2026-05-15):** MCP-local `getAppDir()` / optional `DB90_MCP_HOME`, `credentials.json`, copied state/client/pricing/risk-scanner/readers/claude, `syncOnce` with `claude_code:` session keys + telemetry, hand-rolled `state.lock` advisory lock, `db90_status` / `db90_sync_now`, stdio connect then 5-minute timer + startup sync, `run --once` with exit 1 on failed posts, Vitest `sync.test.ts` + extended server/cli tests. `npm run build` + `npm test` for `@db90/mcp` pass from `packages/tools`.
- **Outstanding (human):** Dev DB verification is partially complete: `~/.db90-mcp/credentials.json` exists, `db90-mcp run --once` inserted two `claude_code` events, and a repeat run skipped both without duplicates. Still compare `db90-claude` and `db90-mcp run --once` against equivalent fresh state before setting story `Status` to `review`.

### File List

- `packages/tools/db90-mcp/src/state.ts`
- `packages/tools/db90-mcp/src/credentials.ts`
- `packages/tools/db90-mcp/src/client.ts`
- `packages/tools/db90-mcp/src/pricing.ts`
- `packages/tools/db90-mcp/src/risk-scanner.ts`
- `packages/tools/db90-mcp/src/readers/claude.ts`
- `packages/tools/db90-mcp/src/lock.ts`
- `packages/tools/db90-mcp/src/sync.ts`
- `packages/tools/db90-mcp/src/server.ts`
- `packages/tools/db90-mcp/src/cli.ts`
- `packages/tools/db90-mcp/src/test/sync.test.ts`
- `packages/tools/db90-mcp/src/test/lock.test.ts`
- `packages/tools/db90-mcp/src/test/server.test.ts`
- `packages/tools/db90-mcp/src/test/cli.test.ts`
- `packages/tools/db90-mcp/package.json`
- `packages/tools/db90-mcp/README.md`
- `packages/tools/db90-mcp/CHANGELOG.md`
- `packages/tools/package-lock.json`

## Change Log

- **2026-05-15:** Story 1.2 implementation — Claude sync in `@db90/mcp`, credentials file, tools, timer, tests; manual dev DB verification still open.
