# Story 1.5: MCP Cursor Sync

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 engineer,
I want the DB90 MCP server to read Cursor's local SQLite telemetry and sync those events alongside Claude Code events,
so that one authenticated MCP installation can forward both editors' usage within the same sync cycle.

## Acceptance Criteria

1. The live MCP package in this repo, `packages/tools/db90-telemetry-mcp/`, gains a new reader module at `src/readers/cursor.ts` that copies and adapts the required SQLite read + payload-mapping logic from `packages/tools/db90-cursor/src/{cursor-reader,mapper}.ts`; the implementation must not deep-import those private modules from `@db90/cursor`.
2. `packages/tools/db90-telemetry-mcp/package.json` adds `better-sqlite3` using the same version family already adopted by `@db90/cursor`, and any TypeScript type support needed to compile the copied reader code cleanly under the MCP package's strict ESM build.
3. `packages/tools/db90-telemetry-mcp/src/sync.ts` no longer performs a Claude-only pass. It orchestrates enabled tools in parallel over `["claude_code", "cursor"]`, runs each tool through its own reader/sync path, and returns a combined summary with per-run `sent`, `failed`, and `skipped` totals.
4. Shared MCP state keeps tool-scoped checkpoints separate so Cursor watermarks cannot collide with Claude session checkpoints. Existing Claude checkpoint behavior under `claude_code:<sessionId>` remains intact, and Cursor progress is tracked independently.
5. `db90_sync_now` gains an optional `tools` array input filter whose schema only accepts `claude_code` and `cursor`. Omitting the field syncs all enabled tools; providing it syncs only the requested subset.
6. The background startup sync and 5-minute interval reuse the same multi-tool sync path as `db90_sync_now`, so a single sync cycle can emit both Claude Code and Cursor events when both have local data.
7. The MCP auth/credential flow is upgraded so the server has valid ingest credentials for both `claude_code` and `cursor` without forcing the user through two separate device-login sessions. Because ingest requests derive `tool_name` from the token-owning `UserToolAccount`, the implementation must not assume one saved token can post both tool streams.
8. `POST /api/v1/integrations/mcp/exchange` accepts `tools: ["claude_code", "cursor"]`, rotates or creates both `UserToolAccount` records inside one request, and returns enough tool-scoped credential data for the MCP package to persist and later select the correct token per tool.
9. Existing backend support for `tool_name: "cursor"` is preserved. The exchange endpoint still validates requested tools against `UserToolAccount::INGEST_TOOLS`, authorizes via `UserToolAccountPolicy`, and remains non-destructive for unrelated tool accounts.
10. MCP tests mirror the existing Cursor reader coverage already present in `packages/tools/db90-cursor/src/test/cursor-reader.test.ts`, adapted for the copied MCP reader module. `mcp_check` must exercise those mirrored reader specs as part of `npm test --workspace=@db90/telemetry-mcp`.
11. Manual definition of done: in one workstation session where both Claude Code and Cursor generated local usage data, a single MCP sync cycle causes both tools' events to arrive in DB90 without requiring a second sync run.
12. Windows install risk is explicitly checked before Phase 8 publish: run one `npm install` smoke test for the MCP package on a Windows GitHub runner to verify `better-sqlite3` installation behavior before release.

## Tasks / Subtasks

- [x] Add Cursor reader support inside the MCP package. (AC: 1-4, 10)
  - [x] Create `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts` by copying the necessary SQLite discovery, read, dedupe, and mapping logic from `packages/tools/db90-cursor/src/cursor-reader.ts` and `packages/tools/db90-cursor/src/mapper.ts`.
  - [x] Preserve Cursor coverage for legacy `cursor.db`, `state.vscdb` daily stats, and `aiCodeTracking.recentCommit`.
  - [x] Keep the copied module self-contained; do not import private `db90-cursor` internals that are not part of `@db90/cursor`'s public `./sync` export.
  - [x] Add mirrored MCP-side tests covering the copied reader behavior.

- [x] Expand MCP dependency and type support. (AC: 2, 12)
  - [x] Add `better-sqlite3` to `packages/tools/db90-telemetry-mcp/package.json` using the same version family as `packages/tools/db90-cursor/package.json`.
  - [x] Add any required TypeScript type package if the MCP build needs it.
  - [x] Keep release risk visible by documenting the Windows install smoke-test requirement in the story completion notes or implementation notes.

- [x] Refactor the MCP sync orchestrator for multi-tool runs. (AC: 3-6)
  - [x] Update `packages/tools/db90-telemetry-mcp/src/sync.ts` so it accepts an optional tool filter and runs Claude and Cursor sync work in parallel.
  - [x] Preserve the existing advisory lock, telemetry recording, background cadence, and rate-limit/backoff behavior already used by the Claude path.
  - [x] Aggregate per-tool results into one summary without letting one failing tool block the other tool's successful posts.
  - [x] Maintain separate checkpoint/watermark namespaces for Claude and Cursor data.

- [x] Extend the MCP server tool schema and runtime behavior. (AC: 5-6, 10-11)
  - [x] Update `packages/tools/db90-telemetry-mcp/src/server.ts` so `db90_sync_now` declares an optional `tools` array schema.
  - [x] Route startup sync, interval sync, and `db90_sync_now` through the same multi-tool sync function.
  - [x] Add server tests for full sync, Cursor-only sync, Claude-only sync, and invalid tool filter rejection.

- [x] Upgrade auth and credential storage for dual-tool ingest. (AC: 7-9)
  - [x] Update `packages/tools/db90-telemetry-mcp/src/auth/exchange.ts` to send `tools` arrays instead of a single `tool_name` when provisioning MCP credentials.
  - [x] Update `packages/tools/db90-telemetry-mcp/src/auth/flow.ts` and `src/auth/credentials.ts` so persisted credentials can represent both tool accounts, not just one `{ token, host }` pair.
  - [x] Preserve backward compatibility for already-saved single-tool credentials, either by migrating them in place or by continuing to read the old shape until `init` refreshes them.
  - [x] Update CLI/help text and auth tests anywhere they currently describe a single-token credentials file if that shape changes.

- [x] Extend the Rails exchange contract for multi-tool MCP setup. (AC: 7-9)
  - [x] Update `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb` to accept `tools: []`, validate every requested tool against `UserToolAccount::INGEST_TOOLS`, and rotate or create all requested accounts under one lock.
  - [x] Return tool-scoped credential data that the MCP package can persist and later choose from per sync source.
  - [x] Add or update request specs for mixed-tool provisioning, validation failure, and token rotation behavior.

- [x] Verify end-to-end and CI coverage. (AC: 10-12)
  - [x] Keep `mcp_check` green with the mirrored Cursor reader specs included in the telemetry-mcp workspace test run.
  - [x] Run `npm run build --workspace=@db90/telemetry-mcp` and `npm test --workspace=@db90/telemetry-mcp` from `packages/tools`.
  - [x] Perform one Windows GitHub runner install smoke test before publish because `better-sqlite3` remains the main cross-platform risk.

### Review Findings

- [x] [Review][Patch] Multi-tool exchange is not actually atomic despite the documented contract [packages/api/app/controllers/api/v1/integrations/mcp_controller.rb:56]
- [x] [Review][Patch] Single-tool re-auth overwrites previously saved token(s) for the other tool [packages/tools/db90-telemetry-mcp/src/auth/flow.ts:67]
- [x] [Review][Patch] Legacy single-tool validation contract drifted from `errors.tool_name` to `errors.tools`, and the staged request spec is now inconsistent with the controller [packages/api/app/controllers/api/v1/integrations/mcp_controller.rb:43]
- [x] [Review][Patch] Cursor-only init can misclassify a legacy flat-token exchange response as a Claude credential [packages/tools/db90-telemetry-mcp/src/auth/exchange.ts:94]
- [x] [Review][Patch] Dual-tool init accepts partial account payloads as success instead of verifying every requested tool was provisioned [packages/tools/db90-telemetry-mcp/src/auth/flow.ts:72]
- [x] [Review][Patch] Cursor watermark advances even when part of the batch failed, which can permanently skip unsent telemetry [packages/tools/db90-telemetry-mcp/src/sync.ts:270]
- [x] [Review][Patch] `db90_sync_now.tools` accepts duplicate tool IDs and can run the same sync slice twice against one credential [packages/tools/db90-telemetry-mcp/src/server.ts:15]
- [x] [Review][Patch] `db90_sync_now` reports success-like no-op behavior when the caller requests a tool that has no configured credential [packages/tools/db90-telemetry-mcp/src/sync.ts:420]
- [x] [Review][Patch] Shared-token multi-tool sync can race and overwrite checkpoints unless slices serialize per credential [packages/tools/db90-telemetry-mcp/src/sync.ts:445]
- [x] [Review][Patch] Cursor daily-stats progression needs its own watermark instead of sharing recent-commit/event timestamps [packages/tools/db90-telemetry-mcp/src/sync.ts:271]
- [x] [Review][Patch] Multi-tool sync path needed direct tests for Cursor failure handling, subset filters, and shared-token checkpoint preservation [packages/tools/db90-telemetry-mcp/src/test/sync-multi.test.ts:78]
- [x] [Review][Patch] Copied Cursor mapper logic in telemetry-mcp is missing the mirrored mapper test coverage that exists in `db90-cursor`, leaving `mapEvent` / `mapDailyStats` / `mapRecentCommit` effectively unverified [packages/tools/db90-telemetry-mcp/src/test/cursor-mapper.test.ts:1]
- [x] [Review][Patch] Story debug/completion notes are stale after the review-driven fixes and still describe the old `cursor:watermark` / reader-only test picture [ _bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md:209 ]
- [x] [Review][Patch] Story file list no longer matches the staged implementation because it omits newer added test files such as `flow.test.ts`, `sync-multi.test.ts`, and `cursor-mapper.test.ts` [ _bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md:229 ]

## Dev Notes

### Story Source And Numbering

- Standard BMAD planning artifacts are incomplete in this workspace: `_bmad-output/planning-artifacts/` is empty and `_bmad-output/implementation-artifacts/sprint-status.yaml` does not exist.
- Story numbering is therefore inferred from the existing sequence of implementation artifacts already present: `1-1` through `1-4`. This story is created as `1-5`.
- The user-supplied request referenced stale paths like `packages/db90-mcp/...`. In this repo the live MCP package is `packages/tools/db90-telemetry-mcp/`, and the live Cursor package is `packages/tools/db90-cursor/`.

### Current Repo State

- `packages/tools/db90-telemetry-mcp/src/sync.ts` is Claude-only today. It reads Claude transcripts, writes shared MCP state, and records lock/rate-limit telemetry.
- `packages/tools/db90-telemetry-mcp/src/server.ts` currently exposes `db90_status`, `db90_sync_now`, and `db90_authenticate`; `db90_sync_now` has no input schema and always runs the Claude-only sync path.
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts` persists exactly one credential object shaped as `{ token, host }`.
- `packages/api/app/controllers/api/v1/ingest_controller.rb` overwrites inbound `event_params[:tool_name]` with `@tool_account.tool_name`, meaning the ingest token determines the final tool attribution.
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb` currently provisions a single ingest token for one `tool_name` per request.
- `packages/tools/db90-cursor/` already contains production reader and mapper logic plus dedicated tests for the SQLite data sources the MCP now needs to consume.

### Implementation Guardrails

- Do not solve this by importing private files from `@db90/cursor`. Its public export surface is `./sync`; `cursor-reader` and `mapper` are intentionally private and documented as unsupported internal modules.
- Do not reuse one ingest token for both tool streams. The Rails ingest endpoint assigns `tool_name` from the authenticating `UserToolAccount`, so a Claude token would tag Cursor payloads as `claude_code` and vice versa.
- Do not regress the existing Claude sync behavior while adding Cursor. The lock file, backoff handling, telemetry reporting, and background timer semantics must stay intact.
- Do not collapse Cursor and Claude checkpoints into one namespace. Claude uses session-sized JSONL checkpointing; Cursor uses timestamp/watermark-style progression and different data sources.
- Do not put connector-specific SQLite reading code into `@db90/sdk`; its README explicitly forbids `cursor-reader`/`better-sqlite3` style source-specific logic.

### Files To Read Before Coding

- `packages/tools/db90-telemetry-mcp/src/sync.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/exchange.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
- `packages/tools/db90-cursor/src/cursor-reader.ts`
- `packages/tools/db90-cursor/src/mapper.ts`
- `packages/tools/db90-cursor/src/test/cursor-reader.test.ts`
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/app/controllers/api/v1/ingest_controller.rb`
- `packages/api/app/models/user_tool_account.rb`
- `.github/workflows/ci.yml`

### File Structure Requirements

- New file:
  - `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts`
- Expected MCP package updates:
  - `packages/tools/db90-telemetry-mcp/package.json`
  - `packages/tools/db90-telemetry-mcp/src/sync.ts`
  - `packages/tools/db90-telemetry-mcp/src/server.ts`
  - `packages/tools/db90-telemetry-mcp/src/auth/exchange.ts`
  - `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
  - `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
  - new MCP-side reader tests under `packages/tools/db90-telemetry-mcp/src/test/`
- Expected backend updates:
  - `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
  - corresponding request specs under `packages/api/spec/requests/api/v1/integrations/`

### Testing Requirements

- MCP package:
  - `npm run build --workspace=@db90/telemetry-mcp`
  - `npm test --workspace=@db90/telemetry-mcp`
- Backend:
  - add request coverage for `POST /api/v1/integrations/mcp/exchange` multi-tool provisioning
- Manual:
  - verify a machine with both Claude Code transcript activity and Cursor SQLite activity produces both tool events in one sync cycle
- Release-risk verification:
  - run at least one Windows install smoke test for `better-sqlite3` before Phase 8 publish

### Latest Technical Information

- Local repo alignment: `packages/tools/db90-cursor/package.json` already standardizes on `better-sqlite3` `^12.9.0`; the MCP package should match that family to avoid native-module skew between sibling tool packages.
- Official `better-sqlite3` npm guidance says prebuilt binaries are available for LTS Node releases, but this package is still a native dependency and can fall back to source builds on unsupported environments. That keeps Windows installability a real release risk even when macOS/Linux CI is green.
- Official `better-sqlite3` upstream history shows a Node 24 prebuild gap was reported in June 2025, and later releases included build fixes such as updating `node-abi` support. Treat this as evidence that install behavior can vary by exact version/platform, which is why the Windows runner smoke test is part of the DoD rather than an optional follow-up.

### Previous Story Intelligence

- Story 1.4 established the current `init` and credential-install path for the MCP package. This story must extend that path rather than introducing a separate auth flow for Cursor.
- Story 1.4 also reinforced a repo-level guardrail: avoid stale `packages/db90-*` paths and work only inside the live `packages/tools/...` packages.
- Recent MCP commits landed incrementally (`mcp skeleton`, `ingest loop reuse`, `keycloak auth`, `claude support`). Keep the same narrow-slice approach instead of mixing this work with unrelated refactors.

### Project Structure Notes

- This repo's tool packages live under `packages/tools/`, not `packages/` root siblings.
- The MCP package is intentionally the orchestration layer. Source-specific local readers may live inside the MCP package, but shared generic ingest code belongs either in existing MCP helpers or in `@db90/sdk` only if it stays source-agnostic.
- Because `mcp_check` installs the whole `packages/tools` workspace on Ubuntu, mirrored Cursor reader tests added to the MCP package will automatically run in CI once they are part of `@db90/telemetry-mcp`'s Vitest suite.

### References

- `packages/tools/db90-telemetry-mcp/src/sync.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/exchange.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
- `packages/tools/db90-telemetry-mcp/package.json`
- `packages/tools/db90-cursor/src/cursor-reader.ts`
- `packages/tools/db90-cursor/src/mapper.ts`
- `packages/tools/db90-cursor/src/sync.ts`
- `packages/tools/db90-cursor/src/test/cursor-reader.test.ts`
- `packages/tools/db90-cursor/package.json`
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/app/controllers/api/v1/ingest_controller.rb`
- `packages/api/app/models/user_tool_account.rb`
- `.github/workflows/ci.yml`
- `plans/npm-distribution-AIX-157/tasks/08-mcp-sync.md`
- `plans/npm-distribution-AIX-157/tasks/09-mcp-tools.md`
- `plans/track-a_and_track-b.md`
- Better SQLite3 npm package: https://www.npmjs.com/package/better-sqlite3
- Better SQLite3 releases: https://github.com/WiseLibs/better-sqlite3/releases
- Better SQLite3 Node 24 prebuild issue: https://github.com/WiseLibs/better-sqlite3/issues/1384

## Dev Agent Record

### Agent Model Used

Composer (Cursor Agent) — Story 1.5 implementation (MCP multi-tool Cursor SQLite + Claude sync).

### Debug Log References

- Local review follow-up verification:
  - `npm test --workspace=@db90/telemetry-mcp -- src/test/auth/exchange.test.ts src/test/auth/exchange-tools.test.ts src/test/auth/credentials.test.ts src/test/auth/flow.test.ts src/test/cli.test.ts`
  - `npm test --workspace=@db90/telemetry-mcp -- src/test/sync-input-schema.test.ts src/test/server.test.ts src/test/sync.test.ts src/test/sync-multi.test.ts`
  - `npm test --workspace=@db90/telemetry-mcp -- src/test/cursor-reader.test.ts src/test/cursor-mapper.test.ts`
  - `npm run build --workspace=@db90/telemetry-mcp`
  - `docker compose exec api bundle exec rspec spec/requests/api/v1/integrations/mcp_spec.rb`
- Result: targeted Vitest, TypeScript build, and MCP exchange request specs are green after the review-driven fixes.

- `resolve_customization.py --skill .agents/skills/bmad-create-story --key workflow`
- Artifact discovery showed `_bmad-output/planning-artifacts/` empty and no `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Recent git titles: `[AIX-161] claude support`, `[AIX-161] keycloak auth`, `[AIX-161] ingest loop reuse`, `[AIX-161] mcp skeleton`

### Completion Notes List

- Implemented `readers/cursor.ts` as a self-contained copy of Cursor SQLite read + ingest mapping (`better-sqlite3` ^12 family + `@types/better-sqlite3`), with mirrored MCP-side reader coverage in `cursor-reader.test.ts` and mirrored mapper coverage in `cursor-mapper.test.ts`.
- `sync.ts`: `syncTelemetryTools` now protects against partial Cursor watermark advancement, uses separate Cursor checkpoint keys for events / daily stats / recent commits, rejects missing requested tool credentials, deduplicates tool filters, and serializes per-slice execution when multiple tools share one credential token.
- `server.ts`: `db90_sync_now` exposes strict optional `tools` (`SYNC_NOW_INPUT_SCHEMA`); startup + interval use same multi-tool path; `db90_status` aggregates session counts across credential-scoped state files; dual credentials via version-2 persisted shape.
- Auth: exchange supports `tools[]` or legacy `tool_name`; credentials persist `{ version: 2, host, accounts: { claude_code?, cursor? } }` while still loading legacy `{ token, host }` as Claude-only accounts.
- Backend: `POST /integrations/mcp/exchange` rotates/creates requested tools inside one membership lock and returns nested `accounts` + flat compat fields for single-tool responses; Swagger updated accordingly.
- CI: added `telemetry_mcp_windows_install` job (`npm ci` + SDK + MCP build on `windows-latest`); chained into deploy `migrate` needs per AC12 smoke gate. Multi-tool sync follow-up tests now also cover shared-token checkpoint preservation and requested-tool validation.
- **Manual / local:** Story AC11 remains human verification on a workstation with real Claude transcripts + Cursor DBs in one MCP sync cycle (not automateable here).

### Change Log

- 2026-05-19 — Story 1.5 implementation: MCP multi-tool Cursor sync, dual-token credentials, Rails multi-tool exchange, Windows CI smoke, swagger sync.

### File List

- `_bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md`
- `.github/workflows/ci.yml`
- `packages/api/swagger/v1/swagger.yaml`
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb`
- `packages/tools/package-lock.json`
- `packages/tools/db90-telemetry-mcp/package.json`
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/exchange.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/client.ts`
- `packages/tools/db90-telemetry-mcp/src/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/sync.ts`
- `packages/tools/db90-telemetry-mcp/src/test/auth/credentials.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/auth/exchange-tools.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/auth/flow.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cursor-mapper.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cursor-reader.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync-multi.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync-input-schema.test.ts`
