# Story 1.6: MCP Health, Logging, and Retry Hardening

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 engineer,
I want the DB90 telemetry MCP to expose real on-disk diagnostics, write logs where the docs say it does, and retry transient ingest failures inside the active sync cycle,
so that operators can understand broken syncs quickly and short-lived API outages do not inflate the user-visible failed counter or leave the system looking flaky.

## Acceptance Criteria

1. The live MCP package in this repo, `packages/tools/db90-telemetry-mcp/`, gains a new `src/log.ts` module that writes MCP operational logs under `~/.db90-mcp/mcp.log` (or `DB90_MCP_HOME/mcp.log` in tests) instead of relying on ad hoc `console.warn` / `console.error` output alone.
2. The logger is dependency-free and built on Node core APIs already available in this package; do not introduce `pino`, `winston`, `rotating-file-stream`, or another logging family for this story.
3. The active log file is capped at 5 MB. When the file would grow past that cap, the logger rotates it and continues writing to the canonical `mcp.log` path so operators always know which file to inspect first.
4. Log output includes enough structured detail to debug sync behavior: sync start/end, requested tool subset, lock skips, credential/tool validation failures, per-event retry attempts, final send failures, and 429/rate-limit pauses. When retry backoff is used, the log must show the attempt number and delay (`1s`, `4s`, `16s`).
5. The package gains a new `src/health.ts` module that builds a single shared diagnostic payload for both the terminal `db90-mcp health` subcommand and the MCP `db90_status` tool, so CLI health and in-editor health do not drift.
6. `db90-mcp health` stops being a one-line stub and prints a real diagnostic including at least: auth/configured status, host, provisioned ingest tools, last sync timestamp, last result counts, recent persisted errors, current state-file path, and log path.
7. `db90_status` surfaces the same underlying health information as the CLI health path. It may keep MCP-friendly JSON formatting, but the source-of-truth fields must come from the shared health module rather than duplicate assembly logic inside `server.ts`.
8. Failure diagnostics survive process boundaries. If a sync fails and the user runs `db90-mcp health` from a fresh terminal process, the command still reports those recent failures from on-disk MCP state rather than only from in-memory `recentErrors`.
9. `packages/tools/db90-telemetry-mcp/src/client.ts` wraps `@db90/sdk`'s single-event `postEvent` with intra-sync exponential retry for transient ingest failures: 3 retries after the initial failure, with delays of `1s`, `4s`, and `16s`.
10. Retry behavior is distinct from the existing 429 handling. Rate-limit / quota responses must continue to honor the SDK `on429` callback and next-tick pause semantics; the new intra-sync retry loop is for transient network / 5xx-style failures that currently return `false` immediately and count as hard failures.
11. Checkpoint semantics remain correct while retries are added. A Claude session or Cursor watermark advances only after a successful POST; failed attempts that later succeed within the same sync cycle must count as sent, not failed, and must not produce duplicate events on the next sync.
12. The MCP README and any package-local operator-facing copy touched by this work are updated to match reality: logs live under `~/.db90-mcp/mcp.log`, health is a real diagnostic, and paths no longer drift between `.db90-mcp` and `.db90-telemetry-mcp`.
13. Automated coverage is added for the new logger/health/retry behaviors, including at minimum:
    - health output with missing credentials, valid credentials, malformed state, and persisted recent errors;
    - retry success after one or more transient failures;
    - retry exhaustion after all backoff attempts fail;
    - 429 behavior remaining distinct from transient retry behavior;
    - log file creation/rotation under `DB90_MCP_HOME`.
14. Manual definition of done: stop the API during an active sync, observe the retry cadence in `~/.db90-mcp/mcp.log`, confirm `db90-mcp health` reports the failure details, then restore the API and verify the next sync drains the backlog without duplicate events.

## Tasks / Subtasks

- [x] Add persistent MCP logging and rotation. (AC: 1-4, 12-13)
  - [x] Create `packages/tools/db90-telemetry-mcp/src/log.ts` with app-dir-aware log-path helpers, append/rotate behavior, and small structured helpers for info/warn/error entries.
  - [x] Keep the logger dependency-free and make it safe when `DB90_MCP_HOME` points at a temp test directory.
  - [x] Replace the most important MCP sync/auth/server `console.*` paths with logger-backed writes while preserving useful terminal stderr where appropriate.

- [x] Add shared health diagnostics. (AC: 5-8, 12-13)
  - [x] Create `packages/tools/db90-telemetry-mcp/src/health.ts` that reads credentials, MCP state, sync telemetry, recent persisted errors, and filesystem paths from one place.
  - [x] Update `src/cli.ts` so `db90-mcp health` renders a multi-line diagnostic instead of the current stub string.
  - [x] Update `src/server.ts` so `db90_status` reuses the shared health builder rather than hand-assembling its own payload.

- [x] Persist recent failure diagnostics in MCP state. (AC: 6-8, 11, 13-14)
  - [x] Extend `packages/tools/db90-telemetry-mcp/src/state.ts` so MCP-specific metadata can record recent errors / last sync summary without breaking existing credential-scoped checkpoint behavior.
  - [x] Preserve existing `claude_code:<sessionId>` and Cursor watermark keys; this story must add operator diagnostics, not replace checkpoint storage.
  - [x] Make sure health can report the active state-file path(s) the operator should inspect.

- [x] Add transient retry backoff to event posting. (AC: 9-11, 13-14)
  - [x] Update `packages/tools/db90-telemetry-mcp/src/client.ts` so transient false-returning sends are retried with `1s`, `4s`, `16s` backoff before surfacing a final failure.
  - [x] Keep `@db90/sdk` as the HTTP primitive and preserve its `on429` callback contract; do not fork or rewrite the SDK client for this story.
  - [x] Ensure `sync.ts` counts retry-then-success events as sent, not failed, and still stops correctly for rate-limited passes.

- [x] Refresh docs and tests. (AC: 12-14)
  - [x] Update `packages/tools/db90-telemetry-mcp/README.md` and any affected changelog/operator notes to document the real health/logging paths and behavior.
  - [x] Add/extend Vitest coverage in `src/test/cli.test.ts`, `src/test/server.test.ts`, `src/test/sync.test.ts`, and new focused test files if cleaner.
  - [x] Keep the manual DoD visible in story completion notes because API-kill mid-sync verification is still a human run.

### Review Findings

- [x] [Review][Patch] Lock-skipped process writes credential state without owning the sync lock [packages/tools/db90-telemetry-mcp/src/sync.ts:514]
- [x] [Review][Patch] Permanent HTTP failures are retried as transient ingest failures [packages/tools/db90-telemetry-mcp/src/client.ts:67]
- [x] [Review][Patch] Missing credential failures are not written to `mcp.log` [packages/tools/db90-telemetry-mcp/src/cli.ts:315]
- [x] [Review][Patch] Dry-run sync mutates persisted health/operator state [packages/tools/db90-telemetry-mcp/src/sync.ts:636]
- [x] [Review][Patch] A single oversized log entry can exceed the 5 MiB active-log cap [packages/tools/db90-telemetry-mcp/src/log.ts:38]

## Dev Notes

### Story Source And Numbering

- Standard BMad planning artifacts are still incomplete in this workspace: `_bmad-output/planning-artifacts/` is empty and `_bmad-output/implementation-artifacts/sprint-status.yaml` does not exist.
- Story numbering is inferred from the existing implementation-artifact chain `1-1` through `1-5`. This story is created as `1-6`.
- The user request referenced stale paths like `packages/db90-mcp/src/log.ts`; in the live repo the MCP package is `packages/tools/db90-telemetry-mcp/`. The new story must target the live package only.

### Current Repo State

- `packages/tools/db90-telemetry-mcp/src/log.ts` and `src/health.ts` do not exist yet.
- `src/cli.ts` currently implements `db90-mcp health` as a one-line stub: `db90-mcp: ok (stdio MCP + multi-tool ingest sync when Claude + Cursor credentials are configured)`.
- `src/server.ts` builds `db90_status` inline from `loadCredentials()`, `getSyncTelemetry()`, and state-file counts; it does not yet reuse a shared health module.
- `src/sync.ts` keeps `lastSyncAt`, `lastSyncResult`, and `recentErrors` only in process memory. That means a new terminal process cannot currently report the last failure via `db90-mcp health`.
- `src/client.ts` is a thin pass-through to `@db90/sdk` for single events and currently does no retrying of transient false-returning posts.
- `@db90/sdk`'s `postEvent` already distinguishes 429 responses via `on429(retryAfter, quotaExceeded)` and otherwise returns `false` on HTTP/network failure without throwing.
- The package README and plan docs already promise richer health/logging behavior than the live code currently delivers, including `~/.db90-mcp/mcp.log`.

### Architecture Compliance

- Keep the package ESM/TypeScript-first and aligned with current repo conventions; avoid introducing a new top-level abstraction or external logger framework.
- Continue to use `getAppDir()` from `state.ts` as the single source for `~/.db90-mcp` vs `DB90_MCP_HOME`.
- Preserve the existing credential-scoped checkpoint model (`state-<host>-<tokenhash>.json`) and advisory lock file semantics under the same app dir.
- Keep `db90_status` no-auth and tolerant of malformed credentials/state, because diagnostics must still work when the setup is broken.
- Preserve current `db90_sync_now` / background sync behavior for successful flows; this story is hardening reliability and observability, not redesigning the sync API.

### Implementation Guardrails

- Do not add retry inside `@db90/sdk` for this story. The retry policy is MCP-package-specific and should remain in `packages/tools/db90-telemetry-mcp/src/client.ts`.
- Do not apply the new exponential retry loop to 429 responses. The current server-driven backoff and stop-this-pass behavior in `sync.ts` is still the correct contract for rate limiting and quota exhaustion.
- Do not advance Claude session checkpoints or Cursor watermarks until the final POST outcome is successful after any retries.
- Do not keep recent failures only in memory. The CLI health requirement means failure summaries must be readable by a fresh process from disk.
- Do not let README/operator docs keep drifting between `.db90-mcp` and `.db90-telemetry-mcp`; this story explicitly closes that mismatch.
- Do not break the `DB90_MCP_HOME` testing pattern already used by the package's Vitest suite.

### Files To Read Before Coding

- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/client.ts`
- `packages/tools/db90-telemetry-mcp/src/sync.ts`
- `packages/tools/db90-telemetry-mcp/src/state.ts`
- `packages/tools/db90-telemetry-mcp/src/lock.ts`
- `packages/tools/db90-telemetry-mcp/src/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync-multi.test.ts`
- `packages/tools/db90-sdk/src/client.ts`
- `packages/tools/db90-telemetry-mcp/README.md`
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
- `plans/npm-distribution-AIX-157/tasks/08-mcp-sync.md`
- `plans/npm-distribution-AIX-157/tasks/09-mcp-tools.md`

### File Structure Requirements

- New files:
  - `packages/tools/db90-telemetry-mcp/src/log.ts`
  - `packages/tools/db90-telemetry-mcp/src/health.ts`
- Expected MCP package updates:
  - `packages/tools/db90-telemetry-mcp/src/cli.ts`
  - `packages/tools/db90-telemetry-mcp/src/server.ts`
  - `packages/tools/db90-telemetry-mcp/src/client.ts`
  - `packages/tools/db90-telemetry-mcp/src/sync.ts`
  - `packages/tools/db90-telemetry-mcp/src/state.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/sync-multi.test.ts`
  - `packages/tools/db90-telemetry-mcp/README.md`
  - `packages/tools/db90-telemetry-mcp/CHANGELOG.md`

### Testing Requirements

- MCP package:
  - `cd packages/tools`
  - `npm run build --workspace=@db90/telemetry-mcp`
  - `npm test --workspace=@db90/telemetry-mcp`
- Add direct test coverage for retry timing/count behavior without sleeping real wall-clock delays; inject or mock the wait primitive.
- Add filesystem-oriented tests under `DB90_MCP_HOME` temp dirs for log creation, log rotation, and persisted health/error reporting.
- Preserve and extend current coverage for `db90_status` missing/malformed credentials, locked syncs, and missing requested tool credentials.
- Manual:
  - stop the API during a sync and confirm the retry cadence is visible in `~/.db90-mcp/mcp.log`;
  - run `db90-mcp health` from a fresh terminal process and confirm the failure is reported;
  - restore the API and verify the next cycle drains unsent events without duplicates.

### Latest Technical Information

- Official Node.js `fs` documentation continues to support appending to files with core APIs and setting file permissions with `chmod`, which means this story can implement the logger with built-in `node:fs` helpers rather than a new dependency. Source: `https://nodejs.org/api/fs.html`
- Official MCP docs still list the TypeScript SDK as a Tier 1 SDK for building servers and clients, so the existing `@modelcontextprotocol/sdk` path remains the right foundation for shared CLI/MCP health output and tool registration. Source: `https://modelcontextprotocol.io/docs/sdk`
- Current repo alignment: `packages/tools/db90-telemetry-mcp/package.json` already depends on `@modelcontextprotocol/sdk ^1.29.0` and has no logger dependency family installed, so a dependency-free logger is the lowest-friction path.

### Previous Story Intelligence

- Story 1.5 already turned the MCP into a dual-tool sync orchestrator with separate Cursor watermarks, requested-tool validation, shared-token serialization, and stronger multi-tool tests. This story must preserve those protections while adding observability and retry hardening.
- Story 1.5 also established that the live package is `packages/tools/db90-telemetry-mcp/`, not the older `packages/db90-mcp/` location.
- Earlier plan docs for Tasks 08 and 09 promised an MCP error ring buffer, real `db90-mcp health`, and `~/.db90-mcp/mcp.log`; this story is the concrete follow-through for those already-documented operator expectations.

### Project Structure Notes

- The MCP package is still the orchestration layer for Claude and Cursor local telemetry. Keep source-specific logic in MCP-local modules or existing readers; do not push logging/health concerns into `@db90/sdk`.
- `state.ts` currently mixes checkpoint storage and app-dir resolution. If you extend state to persist health/error metadata, do it in a way that keeps existing checkpoint files readable and minimizes migration risk.
- The README currently contains at least one stale `.db90-telemetry-mcp` path reference even though runtime state is under `.db90-mcp`; update docs from actual code, not from older plan text.

### References

- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/client.ts`
- `packages/tools/db90-telemetry-mcp/src/sync.ts`
- `packages/tools/db90-telemetry-mcp/src/state.ts`
- `packages/tools/db90-telemetry-mcp/src/lock.ts`
- `packages/tools/db90-telemetry-mcp/src/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync-multi.test.ts`
- `packages/tools/db90-sdk/src/client.ts`
- `packages/tools/db90-telemetry-mcp/README.md`
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
- `plans/npm-distribution-AIX-157/tasks/08-mcp-sync.md`
- `plans/npm-distribution-AIX-157/tasks/09-mcp-tools.md`
- `_bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md`
- Node.js file system docs: `https://nodejs.org/api/fs.html`
- Model Context Protocol SDK docs: `https://modelcontextprotocol.io/docs/sdk`

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Cursor agent)

### Debug Log References

- Dev-story workflow: customization resolved via `_bmad/scripts/resolve_customization.py`; no sprint-status.yaml in repo.
- Vitest required `DB90_MCP_HOME` for log writes during sync tests; `resetBackoffStateForTests` + `setIngestRetryWaitOverrideForTests` avoid cross-test pollution and slow real backoff sleeps.

### Completion Notes List

- Implemented `log.ts` (`mcp.log` / `mcp.log.1`, 5 MiB cap, JSON lines, `mcpLog` mirrors important events to stderr).
- Implemented `health.ts` (`buildHealthSnapshot`, `healthSnapshotToStatusPayload`, `formatHealthForCli`); `server.buildDb90StatusPayload` delegates here; CLI `health` is async and multi-line.
- Extended `state.ts` with optional `mcp_operator`, `credentialStateFilePath`, `withMcpOperator`; `sync.ts` persists operator snapshot per credential token on every telemetry record; lock skips merge with prior on-disk operator block.
- `client.postEvent` retries transient failures up to 3 waits (1s, 4s, 16s); 429 uses `on429` only (`was429` guard). Exported test helpers `setIngestRetryWaitOverrideForTests`, `resetBackoffStateForTests`.
- Docs: README + CHANGELOG updated; removed stale `~/.db90-telemetry-mcp` lock path reference.
- Tests: `log.test.ts`, `health.test.ts`, `client-ingest-retry.test.ts`; extended `sync.test.ts`, `sync-multi.test.ts`, `cli.test.ts`, `server.test.ts`.
- **Manual DoD (AC 14):** Stop API mid-sync → confirm retry lines and delays in `~/.db90-mcp/mcp.log` → fresh terminal `db90-mcp health` shows persisted failures → restore API → next sync sends without duplicate checkpoints (human verification).

### File List

- `packages/tools/db90-telemetry-mcp/src/log.ts`
- `packages/tools/db90-telemetry-mcp/src/health.ts`
- `packages/tools/db90-telemetry-mcp/src/client.ts`
- `packages/tools/db90-telemetry-mcp/src/sync.ts`
- `packages/tools/db90-telemetry-mcp/src/state.ts`
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/test/log.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/health.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/client-ingest-retry.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/sync-multi.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/server.test.ts`
- `packages/tools/db90-telemetry-mcp/README.md`
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
- `_bmad-output/implementation-artifacts/1-6-mcp-health-logging-retries.md`

## Change Log

- **2026-05-19** — Story 1.6 implemented: operational `mcp.log` + rotation, shared health module for CLI / `db90_status`, persisted `mcp_operator` diagnostics, transient ingest retries with 429 isolation, docs and Vitest coverage. Manual mid-sync API outage verification (AC 14) remains an operator checklist item.
