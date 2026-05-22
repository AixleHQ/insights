# Story 1.4: MCP Claude Code Auto-Install

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 engineer,
I want `npx -y @db90/telemetry-mcp init` to not only authenticate but also install the DB90 MCP server into Claude Code's user-scoped MCP configuration,
so that restarting Claude Code is enough for DB90 telemetry to begin flowing without a separate manual config step.

## Acceptance Criteria

1. `packages/tools/db90-telemetry-mcp/src/cli.ts` changes the `init` flow to execute in this order: start device flow, exchange Keycloak token for DB90 ingest credentials, save credentials, write Claude Code MCP config, then print `Restart Claude Code to activate`.
2. The Claude installer logic is isolated under `packages/tools/db90-telemetry-mcp/src/install/` with:
   - `claude.ts` for Claude-specific config discovery/read/write
   - `index.ts` for editor dispatch, with Claude as the only supported editor in this story
3. The implementation must not use the stale request path `packages/db90-mcp/...`; the live package in this repo is `packages/tools/db90-telemetry-mcp/`, and all new install code belongs there.
4. The implementation must verify the current Claude Code MCP config mechanism against official Claude Code docs at implementation time. Current docs describe MCP configuration via `.mcp.json` and `claude mcp` scopes, while `~/.claude/settings.json` is for settings; do not hardcode `~/.claude.json` unless current docs or the installed Claude runtime on the target platform still prove it is the real user-scope MCP store.
5. The installer writes or updates the user-scoped Claude MCP config non-destructively by merging JSON and preserving unrelated keys and other MCP servers. The target entry is named `db90` and resolves to the equivalent of:
   ```json
   {
     "mcpServers": {
       "db90": {
         "command": "npx",
         "args": ["-y", "@db90/telemetry-mcp", "run"]
       }
     }
   }
   ```
6. Cross-platform command handling matches Claude Code expectations. In particular, if the verified docs/runtime require a Windows-specific wrapper such as `cmd /c npx`, the installer must write the correct platform-specific command shape instead of assuming Unix semantics everywhere.
7. The write is idempotent. If the resolved `db90` entry already matches the desired configuration, `init` succeeds without rewriting unrelated content and reports that Claude Code is already configured.
8. If a `db90` entry exists but differs, the installer refuses to clobber it by default and returns a clear error explaining that `--force` is required.
9. `init --force` overwrites only the `db90` MCP server entry while preserving all other JSON content and MCP servers.
10. If authentication succeeds but Claude config installation fails, `init` exits non-zero with a precise install error and does not delete the freshly saved DB90 credentials. A follow-up rerun should be sufficient to finish installation.
11. Tests in `packages/tools/db90-telemetry-mcp/src/test/install.test.ts` use a temp home/config root and verify:
   - new config file creation
   - non-destructive merge with unrelated JSON keys
   - idempotent no-op when already configured
   - refusal to overwrite mismatched `db90` entry without `force`
   - successful overwrite with `force`
12. CLI tests are extended to cover the new `init` sequence, `--force` parsing, and the success message that tells the user to restart Claude Code.
13. Documentation includes a checked-in manual end-to-end checklist at `docs/manual-e2e.md` describing the clean-machine flow: install package, run `npx -y @db90/telemetry-mcp init`, restart Claude Code, verify `/mcp`, trigger a real session, and confirm the session appears in DB90 within five minutes.
14. README and any stale package docs are updated so they no longer instruct users to manually edit `~/.claude.json` unless that path is re-verified as the current Claude Code user MCP config location.
15. Manual DoD: on a machine with Claude Code installed and no prior DB90 setup, `npx -y @db90/telemetry-mcp init` completes auth, installs the Claude MCP entry, Claude Code is restarted, and a real Claude session appears in the DB90 dashboard within five minutes.

## Tasks / Subtasks

- [x] Reconcile the actual Claude Code MCP config target before writing code. (AC: 4, 6, 14)
  - [x] Verify current official Claude Code docs for MCP install scope and storage behavior.
  - [x] Inspect the installed Claude Code behavior locally if docs are ambiguous about the on-disk user-scope file location.
  - [x] Record the chosen path/shape in comments or docs only if it is stable enough to be useful; otherwise keep the path resolution encapsulated in `claude.ts`.
- [x] Add install-layer modules. (AC: 2, 5-9)
  - [x] Create `packages/tools/db90-telemetry-mcp/src/install/claude.ts`.
  - [x] Create `packages/tools/db90-telemetry-mcp/src/install/index.ts`.
  - [x] Model install results explicitly so CLI code can distinguish `already-configured`, `installed`, `requires-force`, and hard failure.
- [x] Update CLI init behavior. (AC: 1, 7-10, 12)
  - [x] Extend `parseArgs()` to support `init --force`.
  - [x] Keep unknown-flag safety intact; `--force` must remain init-only.
  - [x] Run the existing auth flow first, then call the Claude installer, then print `Restart Claude Code to activate`.
  - [x] Preserve current `run`, `run --once`, `health`, and `serve` behavior.
- [x] Keep the current auth/storage behavior intact. (AC: 1, 10)
  - [x] Reuse `loginAndPersistCredentials()` and `saveCredentials()` instead of re-implementing auth or credential persistence.
  - [x] Do not regress keytar/file fallback behavior or `DB90_MCP_HOME` test overrides.
- [x] Add focused tests. (AC: 11-12)
  - [x] Add a dedicated install test file using temp home/config directories.
  - [x] Extend CLI tests to assert install is called only after successful login and that install failures produce non-zero exit.
  - [x] Keep all tests isolated from the real user home and any live Claude config.
- [x] Refresh user-facing docs. (AC: 13-15)
  - [x] Update `packages/tools/db90-telemetry-mcp/README.md`.
  - [x] Update `packages/tools/db90-telemetry-mcp/CHANGELOG.md` if it still describes `init` as snippet-only.
  - [x] Add `docs/manual-e2e.md` with the full clean-machine checklist and observed results section.

### Review Findings

- [x] [Review][Patch] `init --tool-name cursor` still installs Claude config and prints Claude-specific restart guidance [packages/tools/db90-telemetry-mcp/src/cli.ts:201]
- [x] [Review][Patch] Atomic config write can fail across filesystems because temp file is created in `os.tmpdir()` before `renameSync()` into `~/.claude.json` [packages/tools/db90-telemetry-mcp/src/install/claude.ts:83]
- [x] [Review][Patch] `--force` is parsed too loosely, so forms like `init --force junk` and `init --force=false` are accepted instead of rejected as invalid CLI usage [packages/tools/db90-telemetry-mcp/src/cli.ts:86]
- [x] [Review][Patch] CLI tests do not verify the required init sequencing or that install is skipped when auth fails [packages/tools/db90-telemetry-mcp/src/test/cli.test.ts:163]

## Review Findings To Prevent Regressions

- [ ] Avoid encoding the wrong config path. The current request mentions `~/.claude.json`, but current Claude Code docs emphasize `.mcp.json` plus `claude mcp` scopes and `~/.claude/settings.json` for settings.
- [ ] Avoid creating a second package namespace. The repo does not contain `packages/db90-mcp`; the active package is `packages/tools/db90-telemetry-mcp`.
- [ ] Avoid destructive config writes. This change touches a user-level config surface that may already contain unrelated MCP servers or personal settings.
- [ ] Avoid reordering init steps. Config install must happen after credentials are saved so a restart can immediately start the configured server with valid auth state.
- [ ] Avoid Unix-only assumptions. Claude docs explicitly call out special Windows handling for `npx`-backed local MCP servers.

## Dev Notes

### Current Repo State

- Story created from a direct user goal because `_bmad-output/planning-artifacts/` and `sprint-status.yaml` are absent in this workspace. Numbering is inferred from the existing MCP sequence and this story is assumed to be `1-4`.
- Existing implementation already has working Keycloak device flow, ingest-token exchange, credential persistence, and MCP runtime under `packages/tools/db90-telemetry-mcp/`.
- `runInit()` in `packages/tools/db90-telemetry-mcp/src/cli.ts` currently ends after saving credentials and printing a success message; it does not install Claude Code config yet.
- Current package docs still reference manual Claude setup under `~/.claude.json`, which may now be stale relative to official Claude Code docs.

### Existing Code To Reuse

- `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
  - Current state: `loginAndPersistCredentials()` performs device flow, token exchange, and credential save, then returns `{ ok, organizationId }`.
  - This story changes: add a post-auth install step in CLI rather than folding editor config into auth internals.
  - Must preserve: current auth error handling, `fetch` injection, and ability to save credentials before install runs.
- `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
  - Current state: persists credentials via keytar when available, otherwise `credentials.json` in the app dir.
  - This story changes: no schema change expected; only preserve behavior after init sequence changes.
  - Must preserve: keytar fallback, `0600` file mode on POSIX, `clearCredentials()`, and testability with temp app dirs.
- `packages/tools/db90-telemetry-mcp/src/state.ts`
  - Current state: `getAppDir()` resolves `DB90_MCP_HOME` or `~/.db90-mcp`.
  - This story changes: likely no behavior change, but install tests should follow the same temp-home override discipline.
  - Must preserve: current state/checkpoint file location and legacy migration behavior.
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
  - Current state: supports `run`, `init`, `health`, `serve`, and init-only flags for host/keycloak/tool.
  - This story changes: add `--force`, call the installer after auth, and print restart instructions on success.
  - Must preserve: unknown flag safety, init-only flag validation, `run` default behavior, and `run --once`.

### Architecture Compliance

- Keep all work inside the existing distributable tool package under `packages/tools/db90-telemetry-mcp/`.
- Use TypeScript ESM modules and the existing Vitest test style.
- Do not introduce a new config/dependency framework for editor install. Small filesystem helpers under `src/install/` are enough unless the repo already has a shared helper worth reusing.
- Keep comments sparse; add them only around non-obvious config-path or merge behavior.

### Library / Framework Requirements

- Claude Code docs currently show MCP configuration managed through `claude mcp ...` and `.mcp.json`-shaped `mcpServers` objects; story implementation must align with that source of truth.
- Claude Code docs also note a native Windows `cmd /c npx` wrapper requirement for local MCP servers started via `npx`; account for that when generating the `db90` entry.
- Continue using built-in Node fs/path/os helpers and the existing test stack. No JSON-merge dependency should be added unless implementation complexity proves it necessary.

### File Structure Requirements

- New files:
  - `packages/tools/db90-telemetry-mcp/src/install/claude.ts`
  - `packages/tools/db90-telemetry-mcp/src/install/index.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/install.test.ts`
  - `docs/manual-e2e.md`
- Files to update:
  - `packages/tools/db90-telemetry-mcp/src/cli.ts`
  - `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
  - `packages/tools/db90-telemetry-mcp/README.md`
  - `packages/tools/db90-telemetry-mcp/CHANGELOG.md` if it still describes snippet/manual setup
- Files to inspect before coding:
  - `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
  - `packages/tools/db90-telemetry-mcp/src/auth/credentials.ts`
  - `packages/tools/db90-telemetry-mcp/src/state.ts`

### Testing Requirements

- Run from `packages/tools`:
  ```bash
  npm run build --workspace=@db90/telemetry-mcp
  npm test --workspace=@db90/telemetry-mcp
  ```
- Add install tests that never touch the real home directory or a real Claude config.
- Manual end-to-end verification must be recorded in `docs/manual-e2e.md`; automated tests do not replace the clean-machine check.

### Regression Risks

- Do not overwrite unrelated user MCP servers or settings.
- Do not make `init` report success when credentials save succeeded but Claude install failed.
- Do not move credential save after config install; a restarted Claude Code instance should find valid credentials immediately.
- Do not regress current README examples for `run`/`run --once` and MCP behavior while updating install docs.
- Do not assume the config file path from stale package docs; verify current Claude behavior first.

### Previous Story Intelligence

- Story 1.2 established the pattern of using temp app dirs and strict CLI flag parsing; preserve both.
- Story 1.3 already introduced real auth, ingest-token exchange, and `db90_authenticate`; this story should build on that work, not reopen device-flow or backend contract questions.
- Recent commits `ce6e106`, `003aed3`, and `c691cba` show the MCP work landing incrementally under AIX-161. Stay consistent with that slice-by-slice approach rather than mixing in unrelated refactors.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Previous Story 1.3](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-3-mcp-keycloak-device-auth.md)
- [Task 07 plan](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/plans/npm-distribution-AIX-157/tasks/07-mcp-auth.md)
- [Telemetry MCP CLI](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-telemetry-mcp/src/cli.ts)
- [Telemetry MCP auth flow](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-telemetry-mcp/src/auth/flow.ts)
- [Telemetry MCP credentials](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-telemetry-mcp/src/auth/credentials.ts)
- [Telemetry MCP state](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-telemetry-mcp/src/state.ts)
- [Telemetry MCP README](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-telemetry-mcp/README.md)
- Claude Code MCP docs: https://docs.anthropic.com/en/docs/claude-code/mcp
- Claude Code settings docs: https://docs.anthropic.com/en/docs/claude-code/settings

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Cursor Agent)

### Debug Log References

- Workflow `resolve_customization.py` run successfully; Claude Code MCP user scope verified against Anthropic docs (`~/.claude.json`, top-level `mcpServers`).

### Completion Notes List

- Implemented post-auth merge of `mcpServers.db90` into user Claude config (`defaultClaudeUserConfigPath` → `~/.claude.json`, overridable via `DB90_CLAUDE_USER_CONFIG_PATH` for tests). Idempotent on matching `command`/`args`; mismatched `db90` requires `init --force`; install errors yield exit 1 without deleting credentials.
- Added `src/install/claude.ts`, `src/install/index.ts`, `src/test/install.test.ts`; extended `cli.ts` and `cli.test.ts` for `--force`, install hook ordering, and restart message.
- Refreshed README, CHANGELOG, and added `docs/manual-e2e.md`.
- Story created from direct user goal because the standard BMAD sprint/planning artifacts for auto-discovery are not present in this workspace.
- Story numbering is inferred as `1-4` from the existing MCP sequence `1-1` through `1-3`.

### File List

- `packages/tools/db90-telemetry-mcp/src/install/claude.ts`
- `packages/tools/db90-telemetry-mcp/src/install/index.ts`
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cli.test.ts`
- `packages/tools/db90-telemetry-mcp/src/test/install.test.ts`
- `packages/tools/db90-telemetry-mcp/README.md`
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
- `docs/manual-e2e.md`
- `_bmad-output/implementation-artifacts/1-4-mcp-claude-code-auto-install.md`

## Change Log

- **2026-05-19:** Implemented Story 1.4 — Claude user MCP install via `init`, `init --force`, tests, and manual E2E doc.
- **2026-05-18:** Created ready-for-dev story for post-auth Claude Code MCP auto-install, idempotent user-config merge, `--force` handling, install tests, and manual end-to-end documentation.
