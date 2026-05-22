# Story 1.1: Claude Code MCP No-Op Server Round Trip

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 engineer,
I want a minimal `@db90/mcp` server that Claude Code can spawn over stdio and call through the MCP tool surface,
so that we have a verified end-to-end foundation before adding authentication, sync, and richer DB90 tooling.

## Acceptance Criteria

1. `@db90/mcp` exists as a TypeScript ESM package with `db90-mcp` as the published bin and a stdio MCP server as the default runtime path.
2. The CLI accepts `init`, `health`, and `run` subcommands; invoking the bin with no subcommand defaults to `run`, because that is what Claude Code should spawn.
3. The MCP server exposes exactly one placeholder tool named `db90_status`.
4. Calling `db90_status` returns this placeholder payload, with no network calls and no authentication dependency:
   ```json
   {
     "authenticated": false,
     "host": null,
     "last_sync_at": null,
     "sessions_synced": 0,
     "errors": []
   }
   ```
5. A Vitest spec constructs the server in-process and round-trips a `tools/call` request for `db90_status`.
6. CI includes an `mcp_check` job equivalent to the existing Claude package check and `migrate.needs` includes `mcp_check`.
7. In a fresh checkout, `cd packages/tools/db90-mcp && npm ci && npm run build && npm test` is green, or the equivalent workspace-root command is documented if the package depends on the shared `packages/tools/package-lock.json`.
8. After `npm install -g .` from the package, adding the MCP snippet to `~/.claude.json` and restarting Claude Code makes `/mcp` list `db90` as connected and `db90_status` as callable.
9. Manual verification: asking Claude Code to call `db90_status` returns the placeholder JSON above.

## Tasks / Subtasks

- [x] Reconcile package location before editing. (AC: 1, 6, 7)
  - [x] Use the current repo structure: `packages/tools/db90-mcp/`, not the old `packages/db90-mcp/` path from the original request.
  - [x] Confirm `packages/tools/package.json` includes `"db90-mcp"` in workspaces.
  - [x] Do not create a duplicate `packages/db90-mcp` package unless a maintainer explicitly reverses the `packages/tools/` architecture decision.
- [x] Create or reduce the MCP package metadata to the no-op server scope. (AC: 1, 7)
  - [x] Base `package.json` on `packages/tools/db90-claude/package.json`.
  - [x] Set `"name": "@db90/mcp"`.
  - [x] Set `"bin": { "db90-mcp": "./dist/cli.js" }`.
  - [x] Include `@modelcontextprotocol/sdk` and `zod` in dependencies; verify the latest acceptable SDK version at implementation time with `npm view @modelcontextprotocol/sdk version`.
  - [x] Keep TypeScript/Vitest/dev dependency patterns aligned with sibling packages.
  - [x] Copy `packages/tools/db90-claude/tsconfig.json` exactly unless the current MCP package already has an identical tsconfig.
- [x] Implement the CLI entry point. (AC: 2, 7, 8)
  - [x] In `src/cli.ts`, parse `init | health | run`.
  - [x] Default to `run` when no command is provided.
  - [x] `run` starts the stdio MCP server.
  - [x] `health` prints a minimal healthy diagnostic for the no-op phase.
  - [x] `init` should be deliberately thin: either print the Claude config snippet or write it only if the product decision already exists in local docs.
- [x] Implement the MCP server. (AC: 3, 4, 5)
  - [x] In `src/server.ts`, instantiate the MCP server using the TypeScript SDK and wire `StdioServerTransport`.
  - [x] Register only `db90_status`.
  - [x] Ensure the tool has no input schema requirements.
  - [x] Return the exact placeholder shape from AC #4. Avoid richer fields such as `errors_count`, `recent_errors`, resources, auth tools, sync tools, or background timers in this story.
- [x] Add the in-process round-trip test. (AC: 5, 7)
  - [x] Create `src/test/server.test.ts`.
  - [x] Construct the server without spawning a child process.
  - [x] Send a `tools/call` request for `db90_status`.
  - [x] Assert the response content parses to the exact placeholder JSON.
- [x] Add/update README. (AC: 8, 9)
  - [x] Keep `README.md` thin: install, build/test, Claude Code snippet, first manual call.
  - [x] Avoid documenting auth, sync, resources, dashboards, Keycloak, or telemetry forwarding in this story.
- [x] Add/update CI. (AC: 6)
  - [x] Mirror the existing `claude_check` job shape in `.github/workflows/ci.yml`.
  - [x] Use the repo's current workspace install pattern under `packages/tools`.
  - [x] Add `mcp_check` to `migrate.needs`.

### Review Findings

- [x] [Review][Decision] New `.gitignore` rules hide local agent/skill directories — Resolved: keep these ignore rules as local/generated artifact ignores.
- [x] [Review][Patch] Local global install can produce a broken `db90-mcp` bin [packages/tools/db90-mcp/package.json:40] — fixed with `prepare`
- [x] [Review][Patch] Test does not prove the MCP server exposes exactly one tool [packages/tools/db90-mcp/src/test/server.test.ts:15] — fixed with `listTools()` assertion
- [ ] [Review][Patch] Manual Claude Code `/mcp` and `db90_status` verification is not evidenced [_bmad-output/implementation-artifacts/1-1-mcp-noop-server.md:139] — pending real Claude Code restart/manual call
- [x] [Review][Patch] `mcp_check` does not fully mirror the existing `claude_check` job shape [.github/workflows/ci.yml:184] — fixed with SDK build step
- [x] [Review][Decision] Full diff no longer matches Story 1.1 no-op scope — Resolved: treat this branch as stacked Story 1.1 + Story 1.2, so the sync/timer expansion is intentional and reviewed under the full diff.
- [x] [Review][Patch] Manual verification is checked off while still described as pending [_bmad-output/implementation-artifacts/1-1-mcp-noop-server.md:76] — fixed by reopening the manual verification item and returning the story to `in-progress`
- [x] [Review][Patch] Story 1.2 manual dev DB verification is checked off while notes say it was not executed [_bmad-output/implementation-artifacts/1-2-mcp-claude-sync-timer.md:89] — fixed by reopening the manual verification task in Story 1.2
- [x] [Review][Patch] Stale-lock recovery can remove another active process lock [packages/tools/db90-mcp/src/lock.ts:32] — fixed with lock owner tokens and release ownership checks
- [x] [Review][Patch] Rate-limit backoff is not honored inside the current sync loop [packages/tools/db90-mcp/src/sync.ts:74] — fixed by stopping the current sync pass after 429 backoff is set
- [x] [Review][Patch] `db90_sync_now` reports `ok: true` for locked or failed syncs [packages/tools/db90-mcp/src/server.ts:100] — fixed by deriving `ok` from sync result success
- [x] [Review][Patch] Background sync captures credentials only once at startup [packages/tools/db90-mcp/src/server.ts:128] — fixed by reloading credentials on each background sync pass

## Dev Notes

### Current Repo State

- The repository already contains `packages/tools/db90-mcp/` with a richer MCP scaffold: auth, sync, keychain, resources, multiple tools, background sync, and CI integration. This story's requested scope is smaller and older than the current package state. The dev agent must decide whether the work is already superseded or whether this story is intended as a reset/simplification. Do not silently add a second package.
- `.github/workflows/ci.yml` already has an `mcp_check` job and `migrate.needs` already includes `mcp_check`. Verify rather than duplicate.
- Existing MCP CLI currently uses `serve` as the default command. This story requests `run`. If changing an existing package, consider backward compatibility: either support both `run` and `serve` with `run` documented as the required command, or confirm the old `serve` command is safe to remove.
- Existing MCP `db90_status` currently returns authentication, host, last sync, error count, and recent errors. This story requires a fixed placeholder payload with `sessions_synced` and `errors`. Tests must enforce the requested phase-0 shape.
- Existing package lock under `packages/tools/package-lock.json` resolves `@modelcontextprotocol/sdk` to `1.29.0` and `zod` to `4.3.6` while `package.json` allows `@modelcontextprotocol/sdk: ^1.0.0` and `zod: ^3.23.0 || ^4.0.0`. Because the user requested latest verification at implementation time, run `npm view @modelcontextprotocol/sdk version` and update the package/lock consistently if needed.

### Architecture Compliance

- Tool packages live under `packages/tools/` per `plans/npm-distribution-AIX-157/orientation.md` and the current workspace root.
- Use ESM imports/exports and `moduleResolution: "NodeNext"` as in `packages/tools/db90-claude/tsconfig.json`.
- Keep the server side-effect free for this phase: no background intervals, no disk state, no auth, no Keycloak, no telemetry sync, and no Rails API calls.
- Do not introduce another MCP framework. Use `@modelcontextprotocol/sdk` directly.
- Keep the public surface intentionally small: one tool, no resources, no prompts.

### File Structure Requirements

- `packages/tools/db90-mcp/package.json`
- `packages/tools/db90-mcp/tsconfig.json`
- `packages/tools/db90-mcp/src/cli.ts`
- `packages/tools/db90-mcp/src/server.ts`
- `packages/tools/db90-mcp/src/test/server.test.ts`
- `packages/tools/db90-mcp/README.md`
- `.github/workflows/ci.yml`

Original request paths used `packages/db90-mcp/...`; the current repo has already moved distributable tool packages under `packages/tools/...`. Use the current paths above.

### Testing Requirements

- Run the package checks:
  ```bash
  cd packages/tools
  npm ci
  npm run build --workspace=@db90/mcp
  npm test --workspace=@db90/mcp
  ```
- If validating from the package directory is required by the acceptance criteria, confirm whether `npm ci` works there. Current repo uses a shared `packages/tools/package-lock.json`, so package-local `npm ci` may fail unless a package-local lockfile is intentionally added.
- Add a test that validates the JSON payload exactly. This prevents later auth/sync work from accidentally changing the phase-0 contract.
- Manual verification is outside Vitest: global install, Claude config, restart Claude Code, `/mcp`, then ask Claude to call `db90_status`.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [MCP package plan](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/plans/npm-distribution-AIX-157/tasks/06-mcp-scaffold.md)
- [NPM distribution orientation](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/plans/npm-distribution-AIX-157/orientation.md)
- [Existing MCP package](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-mcp/package.json)
- [Existing CI](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/.github/workflows/ci.yml)
- Latest SDK check: public package mirrors can lag or disagree; treat `npm view @modelcontextprotocol/sdk version` at implementation time as authoritative and keep `package.json` plus `package-lock.json` consistent.

## Dev Agent Record

### Agent Model Used

Cursor agent (Claude Sonnet 4.5).

### Implementation Plan

Simplified the existing `packages/tools/db90-mcp` package to the story’s phase-0 contract: removed auth/sync/keytar modules, single `db90_status` tool with static JSON, CLI default `run` with `serve` alias, thin `init` (print snippet only), in-process Vitest via `InMemoryTransport` + `Client.callTool`. Confirmed CI already had `mcp_check` and `migrate.needs`. Pinned SDK dependency to `^1.29.0` after `npm view` (1.29.0). Regenerated `packages/tools/package-lock.json` after dropping `keytar`.

### Debug Log References

- `npm run build --workspace=@db90/sdk` from `packages/tools` — green.
- `npm run build --workspace=@db90/mcp` from `packages/tools` — green.
- `npm test --workspace=@db90/mcp` from `packages/tools` — green, 2 files / 6 tests.
- `npm pack --dry-run` from `packages/tools/db90-mcp` — green after normal npm cache access; `prepare` ran `tsc` and tarball included `dist/cli.js` and `dist/server.js`.

### Completion Notes List

- Story created from direct user goal because no BMad sprint status, PRD, epics, or UX artifacts were present in `_bmad-output/planning-artifacts`.
- Current repo state appears ahead of this requested phase-0 story; implementation should verify whether to simplify existing MCP or treat the story as already covered by later work.
- Implemented reset to phase-0 no-op per AC; all workspace tool packages (`@db90/sdk`, `@db90/claude`, `@db90/cursor`, `@db90/mcp`) build and test green from `packages/tools`.
- Review patches applied: local global install now builds via `prepare`, MCP server test asserts exactly one listed tool, and `mcp_check` now mirrors the Claude job's SDK build step.
- Remaining action item: manual Claude Code verification (`npm install -g .`, config snippet, restart Claude Code, `/mcp`, call `db90_status`) still needs to be performed in the interactive Claude Code environment.

### File List

- `packages/tools/db90-mcp/package.json`
- `packages/tools/db90-mcp/tsconfig.json`
- `packages/tools/db90-mcp/README.md`
- `packages/tools/db90-mcp/CHANGELOG.md`
- `packages/tools/db90-mcp/src/cli.ts`
- `packages/tools/db90-mcp/src/server.ts`
- `packages/tools/db90-mcp/src/test/cli.test.ts`
- `packages/tools/db90-mcp/src/test/server.test.ts`
- `packages/tools/package-lock.json`
- `.github/workflows/ci.yml`
- `packages/tools/db90-mcp/src/auth.ts` (deleted)
- `packages/tools/db90-mcp/src/config.ts` (deleted)
- `packages/tools/db90-mcp/src/keychain.ts` (deleted)
- `packages/tools/db90-mcp/src/lock.ts` (deleted)
- `packages/tools/db90-mcp/src/log.ts` (deleted)
- `packages/tools/db90-mcp/src/state.ts` (deleted)
- `packages/tools/db90-mcp/src/sync.ts` (deleted)
- `packages/tools/db90-mcp/src/test/auth.test.ts` (deleted)
- `packages/tools/db90-mcp/src/test/lock.test.ts` (deleted)
- `packages/tools/db90-mcp/src/test/sync.test.ts` (deleted)
- `_bmad-output/implementation-artifacts/1-1-mcp-noop-server.md`

## Change Log

- 2026-05-15: Reset `@db90/mcp` to phase-0 (single `db90_status`, CLI `run` default, Vitest in-process round-trip, README + lockfile). Added `mcp_check` SDK build parity, `prepare` build hook for local global install, and exact tool-list test coverage.
