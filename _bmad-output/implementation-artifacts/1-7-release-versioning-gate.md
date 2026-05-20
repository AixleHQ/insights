# Story 1.7: Release and Versioning Gate

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 platform maintainer,
I want the telemetry MCP package to have a guarded 0.1.0 release path, clear operator documentation, and a recommended dashboard install path,
so that teammates can publish and install `@db90/telemetry-mcp` without private context from the author.

## Acceptance Criteria

1. `.github/workflows/release-cli.yml` is updated so `cli-mcp-v*` tag pushes resolve to `package=mcp`, `working_directory=packages/tools/db90-telemetry-mcp`, and publish the MCP package through the same version-match, obsolete-scope, local-dependency, install, SDK build, package build, package test, pack-content, and `npm publish` gates used by the existing Claude and Cursor paths.
2. `workflow_dispatch` in `release-cli.yml` accepts `mcp` as a third package choice and enforces the same explicit version input and `package.json` version equality check as tag-triggered publishes.
3. The workflow removes the stale "MCP intentionally excluded" comments, but does not weaken existing guards for `@db90/claude` or `@db90/cursor`.
4. Pack verification covers the MCP tarball and allows only `dist/**`, `README.md`, `LICENSE`, `package.json`, and staged bundled SDK files when required by the package's publish model. If `@db90/sdk` is still private or referenced as `"*"`, the MCP publish gate must fail if the SDK would not be installable from the published tarball.
5. `packages/tools/db90-telemetry-mcp/package.json` and `packages/tools/db90-telemetry-mcp/CHANGELOG.md` represent the first public release consistently as `0.1.0`; any `Unreleased` items shipping in this version are moved or summarized under a dated `## 0.1.0 - YYYY-MM-DD` entry.
6. The release runbook in `packages/tools/RELEASING.md` covers `mcp` alongside `claude` and `cursor`, including tag prefix `cli-mcp-vX.Y.Z`, the `packages/tools/db90-telemetry-mcp` working directory exception, and MCP-specific smoke-test commands.
7. The implementation does not create another MCP package namespace. The live package remains `packages/tools/db90-telemetry-mcp/` and the published package remains `@db90/telemetry-mcp`.
8. After merge, maintainers can tag `cli-mcp-v0.1.0`, push the tag, watch `Release CLI to npm`, and verify `npm view @db90/telemetry-mcp version` returns `0.1.0`.
9. The clean-machine smoke test is documented and executable: from a machine or temp user profile without prior DB90 MCP setup, run `npx -y @db90/telemetry-mcp@0.1.0 init`, complete the Keycloak/OIDC device login, confirm Claude Code user config contains the `db90` MCP entry, restart Claude Code, and confirm `db90_status` / `db90-mcp health` report the expected auth/config state.
10. The clean-machine install plus OIDC init flow completes in under five minutes under normal network conditions, excluding human time spent finding credentials or permissions that should already be provisioned.
11. `packages/tools/db90-telemetry-mcp/README.md` is rewritten or expanded to mirror the useful structure of `packages/tools/db90-claude/README.md`: integration with db90-rails, roles or audience, installation, quick start, first-run setup, configuration, CLI commands, MCP tools, operational logging/state, troubleshooting, local development, and release/operator notes.
12. The MCP README is self-contained: a teammate can follow it to install, initialize, troubleshoot Keycloak device login, inspect logs/state, run health checks, and verify ingestion without asking the author for hidden steps.
13. A new `architecture/mcp-server.md` document is added with a system diagram showing `editor -> MCP stdio -> readers -> ingest API -> Temporal workflow`, and its ingest API/Temporal description matches `packages/api/app/controllers/api/v1/ingest_controller.rb`, especially `store_raw_event` followed by `start_ingestion_workflow` and fallback direct insert.
14. `packages/web/src/components/integrations/IngestTokenConnectSheet.tsx` adds a third setup tab named `MCP (recommended)` for Claude Code integrations, showing `npx -y @db90/telemetry-mcp init` as the recommended command while preserving existing Claude CLI/hook instructions and Cursor setup behavior as escape hatches.
15. The MCP setup tab copy makes the practical difference clear without requiring a token paste: one-time login, installs the Claude Code MCP server, and auto-forwards Claude Code plus Cursor telemetry when both accounts are provisioned by the init flow.
16. `IngestTokenConnectSheet` uses the existing shadcn/Radix `Tabs` primitives from `packages/web/src/components/ui/tabs.tsx`; it does not invent a new tab component or add decorative card-in-card UI.
17. `packages/web/src/components/integrations/IngestTokenConnectSheet.test.tsx` covers the new MCP tab, verifies the recommended command is shown by default for Claude Code setup, verifies CLI/manual alternatives remain reachable, and verifies Cursor setup does not regress.
18. Relevant local verification passes before tagging: `npm run build --workspace=@db90/telemetry-mcp`, `npm test --workspace=@db90/telemetry-mcp`, and the affected web test surface for `IngestTokenConnectSheet`.
19. Manual release verification is recorded in the story completion notes or PR description: tag pushed, workflow URL/status, `npm view @db90/telemetry-mcp` result, clean-machine `npx -y @db90/telemetry-mcp@0.1.0 init` result, elapsed time, and any OIDC/troubleshooting notes.

## Tasks / Subtasks

- [x] Re-enable MCP in the release workflow. (AC: 1-4, 7)
  - [x] Add `cli-mcp-v*` to `on.push.tags`.
  - [x] Add `mcp` to `workflow_dispatch.inputs.package.options`.
  - [x] Add an explicit `refs/tags/cli-mcp-v*` branch in the `resolve` job before the workflow-dispatch branch.
  - [x] Remove comments that say MCP is intentionally excluded.
  - [x] Review the pack-content guard for MCP and make SDK bundling/installability fail-closed if the published package cannot resolve `@db90/sdk`.

- [x] Update release/version documentation. (AC: 5-6, 8-10, 19)
  - [x] Date and normalize the `0.1.0` changelog entry in `packages/tools/db90-telemetry-mcp/CHANGELOG.md`.
  - [x] Update `packages/tools/RELEASING.md` so the generic release flow covers `claude`, `cursor`, and `mcp`.
  - [x] Add MCP-specific smoke-test steps: `npm view @db90/telemetry-mcp version`, `npx -y @db90/telemetry-mcp@0.1.0 init`, Claude config check, `db90_status`, and `db90-mcp health`.

- [x] Rewrite the MCP package README for teammate-ready setup. (AC: 11-12)
  - [x] Mirror the section structure and practical tone of `packages/tools/db90-claude/README.md`.
  - [x] Document install/init with `npx -y @db90/telemetry-mcp init`.
  - [x] Document required Keycloak issuer behavior, local dev defaults, and the "Device Authorization Grant disabled" troubleshooting path.
  - [x] Document logs and state under `~/.db90-mcp` / `DB90_MCP_HOME`, including `mcp.log`, rotation, credentials fallback, credential-scoped state files, and `db90-mcp health`.
  - [x] Include clear verification steps for confirming events reached DB90.

- [x] Add MCP architecture documentation. (AC: 13)
  - [x] Create `architecture/mcp-server.md`.
  - [x] Include a Mermaid diagram with the exact flow: editor, MCP stdio server, Claude/Cursor readers, `POST /api/v1/ingest/events`, raw-event storage, Temporal `Workflows::IngestionSanitizationWorkflow`, and fallback direct insert.
  - [x] Reference the controller behavior from `packages/api/app/controllers/api/v1/ingest_controller.rb` lines around `store_raw_event` and `start_ingestion_workflow`.

- [x] Add the recommended MCP setup tab to the dashboard sheet. (AC: 14-17)
  - [x] Import and use `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` from the existing UI primitive.
  - [x] For `providerId === "claude-code"`, default to an `MCP (recommended)` tab with command `npx -y @db90/telemetry-mcp init`.
  - [x] Keep existing `npx @db90/claude --token ... --host ...` and optional `settings.json` hook instructions reachable in non-recommended tabs.
  - [x] Do not require or display the one-time ingest token in the MCP tab as the primary setup path; MCP init provisions credentials through Keycloak/OIDC.
  - [x] Preserve Cursor setup behavior, including `npx @db90/cursor --token ...`.

- [ ] Verify locally, then complete release manual gates. (AC: 8-10, 18-19)
  - [x] From `packages/tools`, run `npm run build --workspace=@db90/telemetry-mcp`.
  - [x] From `packages/tools`, run `npm test --workspace=@db90/telemetry-mcp`.
  - [x] Run the affected web test for `IngestTokenConnectSheet`.
  - [ ] After merge, tag `cli-mcp-v0.1.0`, push the tag, watch the workflow, verify npm, and perform the clean-machine smoke test.

### Review Findings

- [x] [Review][Patch] Dashboard MCP command omits the API host, so init defaults to localhost [packages/web/src/components/integrations/IngestTokenConnectSheet.tsx:91]
- [x] [Review][Patch] MCP tab copy says to rerun init for host rotation, but the displayed command has no host [packages/web/src/components/integrations/IngestTokenConnectSheet.tsx:168]
- [x] [Review][Patch] Release pack allowlist permits any `node_modules/@db90/sdk/**` file instead of only staged SDK files [/.github/workflows/release-cli.yml:175]
- [x] [Review][Patch] Post-merge release verification is marked complete before evidence exists [/_bmad-output/implementation-artifacts/1-7-release-versioning-gate.md:72]

## Dev Notes

### Story Source and Numbering

- Standard BMad planning artifacts are absent in this workspace: `_bmad-output/planning-artifacts/` is empty and `_bmad-output/implementation-artifacts/sprint-status.yaml` does not exist.
- Story numbering is inferred from the existing implementation-artifact chain `1-1` through `1-6`. This story is created as `1-7`.
- This story corresponds to the user's "Release + versioning gate" and "Documentation" request, and to the remaining Task 10 release/integration work in `plans/npm-distribution-AIX-157/tasks/10-mcp-publish.md`.

### Current Repo State

- `.github/workflows/release-cli.yml` currently has only `cli-claude-v*` and `cli-cursor-v*` push tag triggers. It explicitly comments that `cli-mcp-v*` is excluded, even though the live MCP package now has real Claude/Cursor sync code from Stories 1.5 and 1.6.
- `release-cli.yml` already contains a workflow-dispatch path that can map `INPUT_PACKAGE == "mcp"` to `packages/tools/db90-telemetry-mcp`, but the UI choice omits `mcp`, so maintainers cannot select it manually.
- The release workflow currently uses `actions/setup-node@v4` with Node `20` and publishes with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. That is token-based npm publishing, not npm Trusted Publishing. The story's "including OIDC" smoke-test requirement is Keycloak/OIDC device login during `db90-mcp init`.
- If the team decides to migrate npm publishing itself to npm Trusted Publishing/OIDC in this story, update all release paths and the runbook deliberately. Do not silently change only MCP publishing while leaving Claude/Cursor on a different auth model.
- `packages/tools/db90-telemetry-mcp/package.json` is already version `0.1.0`, public-scoped, Node `>=20`, and has `files: ["dist", "README.md", "LICENSE"]`.
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md` currently has a large `Unreleased` section plus a `0.1.0 - initial scaffold` entry. Before public release, this should not make the public package look like the shipped behavior is still unreleased.
- `packages/tools/RELEASING.md` still says MCP is excluded because `sync.ts` had scaffold stubs. That is stale after Stories 1.5 and 1.6.
- `architecture/mcp-server.md` does not exist. The repo has `architecture/architecture.md`, which already documents Temporal and ingestion generally.
- `packages/web/src/components/integrations/IngestTokenConnectSheet.tsx` currently has Claude Code setup instructions for the standalone `@db90/claude` CLI and an advanced hook snippet. Cursor setup remains a simple `npx @db90/cursor --token ...` command.
- `packages/web/src/components/ui/tabs.tsx` already provides the local shadcn/Radix tab primitives. Reuse it.

### Release and npm Guardrails

- Keep branch and commit conventions from project context: branch from `develop`, commit message `[AIX-XX] Short imperative description`.
- Do not use `npm publish` manually from a developer machine for this package. The release path should go through `.github/workflows/release-cli.yml`.
- Do not force-push or retag a published version. npm docs state a package name/version pair cannot be reused after publication, even if removed.
- Current npm Trusted Publishing docs say OIDC trusted publishing requires npm CLI `11.5.1+` and Node `22.14.0+`, while the repo workflow currently uses Node `20`. If implementing npm Trusted Publishing, bump the release workflow runtime and document the npm package trusted-publisher setup. Otherwise keep the existing `NPM_TOKEN` path and treat Keycloak device login as the OIDC smoke-test surface.
- npm provenance docs say GitHub Actions provenance requires `id-token: write`, a GitHub-hosted runner, and `npm publish --provenance`; trusted publishing can generate provenance automatically. The current workflow has `id-token: write` but does not pass `--provenance`.
- If adding `--provenance` under token-based publishing, confirm the repository is public and the package `repository.url` exactly matches the GitHub repository path. The MCP package currently has repository metadata pointing at `https://github.com/dualboot-partners/db90-rails.git` with directory `packages/tools/db90-telemetry-mcp`.
- Do not weaken existing release guards: version match, obsolete scope rejection, `file:`/`link:` dependency rejection, workspace `npm ci`, SDK build, package build/test, and pack allowlist are all part of the release gate.

### Documentation Guardrails

- The MCP README should not assume the reader has read the Claude CLI README or previous stories.
- Preferred end-user command is `npx -y @db90/telemetry-mcp init`. `db90-mcp init` is fine after package install, but the README and dashboard should use the `npx -y` form for first-run setup.
- Document that `init` writes the Claude Code MCP entry to user config `~/.claude.json`, not repo `.mcp.json`.
- Document that `--tool-name cursor` skips Claude MCP auto-install; the recommended all-tools path should omit `--tool-name` so the exchange can provision both `claude_code` and `cursor`.
- Document `DB90_MCP_HOME` only as a test/advanced override. The default operational path is `~/.db90-mcp`.
- Troubleshooting must include at least:
  - Keycloak issuer not configured for published package usage.
  - Device Authorization Grant disabled for the `db90-web` client.
  - Conflicting existing `db90` MCP entry in `~/.claude.json` and use of `--force`.
  - Missing credentials or malformed credentials in `db90-mcp health`.
  - Where to inspect `~/.db90-mcp/mcp.log` and state files.

### Architecture Documentation Requirements

- The requested system diagram is:

```mermaid
flowchart LR
  Editor[Claude Code / Cursor] -->|MCP stdio| MCP[@db90/telemetry-mcp]
  MCP --> Readers[Claude JSONL reader / Cursor SQLite reader]
  Readers -->|POST /api/v1/ingest/events| Ingest[Api::V1::IngestController#create]
  Ingest --> Raw[RawEventStore / MinIO]
  Ingest -->|start_workflow| Temporal[Workflows::IngestionSanitizationWorkflow]
  Temporal --> Events[ToolEvents::Upsert / tool_events]
  Ingest -.Temporal unavailable.-> Fallback[fallback_direct_insert]
  Fallback --> Events
```

- Match the code in `packages/api/app/controllers/api/v1/ingest_controller.rb`: `create` stores the raw request body, starts `Workflows::IngestionSanitizationWorkflow` with raw event bucket/key and normalized event params, returns `202 Accepted`, and falls back to direct insert if Temporal start fails.
- Be careful with "readers -> ingest API" wording: readers produce normalized DB90 ingest payloads, but `IngestController` still overwrites `organization_id`, `user_id`, `tool_name`, and default `event_type` based on the authenticated ingest token.

### Dashboard UX and Code Requirements

- Keep the sheet functional and compact. This is an operational setup sheet, not a landing page.
- Use the existing `Tabs` primitives; do not add a new dependency.
- The MCP tab should be the first/default tab for Claude Code setup. The standalone CLI and advanced hook can remain as secondary tabs because they still require the one-time token displayed by the sheet.
- Avoid presenting a token-paste command as the primary path for the MCP tab, because the MCP flow uses Keycloak/OIDC and stores credentials itself.
- Preserve the existing copy-to-clipboard behavior for the ingest token and standalone CLI command.
- Ensure long commands wrap cleanly on narrow sheets. Existing `pre` blocks use `whitespace-pre-wrap break-all`; keep that behavior for the new command.
- Tests should use React Testing Library queries for tab names and command text. Do not test implementation details of Radix internals.

### Files to Read Before Coding

- `.github/workflows/release-cli.yml`
- `packages/tools/RELEASING.md`
- `packages/tools/db90-telemetry-mcp/package.json`
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
- `packages/tools/db90-telemetry-mcp/README.md`
- `packages/tools/db90-claude/README.md`
- `packages/tools/db90-cursor/README.md`
- `packages/tools/db90-telemetry-mcp/src/cli.ts`
- `packages/tools/db90-telemetry-mcp/src/server.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/flow.ts`
- `packages/tools/db90-telemetry-mcp/src/auth/exchange.ts`
- `packages/tools/db90-telemetry-mcp/src/install/claude.ts`
- `packages/tools/db90-telemetry-mcp/src/health.ts`
- `packages/tools/db90-telemetry-mcp/src/log.ts`
- `packages/api/app/controllers/api/v1/ingest_controller.rb`
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/app/services/mcp/ingest_token_exchange_service.rb`
- `packages/api/app/models/user_tool_account.rb`
- `architecture/architecture.md`
- `packages/web/src/components/integrations/IngestTokenConnectSheet.tsx`
- `packages/web/src/components/integrations/IngestTokenConnectSheet.test.tsx`
- `packages/web/src/components/ui/tabs.tsx`
- `plans/npm-distribution-AIX-157/tasks/10-mcp-publish.md`
- `_bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md`
- `_bmad-output/implementation-artifacts/1-6-mcp-health-logging-retries.md`

### File Structure Requirements

- Expected updates:
  - `.github/workflows/release-cli.yml`
  - `packages/tools/RELEASING.md`
  - `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
  - `packages/tools/db90-telemetry-mcp/README.md`
  - `packages/web/src/components/integrations/IngestTokenConnectSheet.tsx`
  - `packages/web/src/components/integrations/IngestTokenConnectSheet.test.tsx`
- Expected new file:
  - `architecture/mcp-server.md`
- Do not create:
  - `packages/db90-mcp/`
  - a separate `@db90/mcp` package
  - a new frontend tabs primitive

### Testing Requirements

- MCP package:
  - `cd packages/tools`
  - `npm run build --workspace=@db90/telemetry-mcp`
  - `npm test --workspace=@db90/telemetry-mcp`
- Web:
  - Run the focused `IngestTokenConnectSheet` test through the repo's existing web test command or package script.
  - If the focused command is unclear, run the broader web test surface and record the exact command.
- Release dry-run:
  - Use the workflow's `npm pack --dry-run --json` logic locally for MCP if changing pack allowlists or SDK bundling behavior.
- Manual post-merge:
  - `git checkout develop && git pull`
  - `git tag cli-mcp-v0.1.0`
  - `git push origin cli-mcp-v0.1.0`
  - Watch `.github/workflows/release-cli.yml`.
  - `npm view @db90/telemetry-mcp version` should print `0.1.0`.
  - On a clean machine/profile, run `npx -y @db90/telemetry-mcp@0.1.0 init`, complete Keycloak/OIDC, restart Claude Code, verify `db90_status` and `db90-mcp health`.

### Previous Story Intelligence

- Story 1.5 established real Cursor sync inside the MCP package: copied Cursor SQLite readers/mappers, multi-tool orchestration over `claude_code` and `cursor`, multi-tool credential exchange, shared-token serialization, and tests for cursor failures/subset filters/checkpoints.
- Story 1.6 established production observability: `mcp.log`, shared `health.ts`, persisted `mcp_operator` diagnostics, transient ingest retries, 429 isolation, and updated MCP README content.
- Both previous stories reinforce that the live package is `packages/tools/db90-telemetry-mcp/`; stale references to `packages/db90-mcp` or `@db90/mcp` are wrong.
- Story 1.6 review found several subtle sync-state regressions. When changing docs or release gates, preserve the current health/logging/retry semantics and avoid implying dry-run or lock-skipped syncs mutate state incorrectly.

### Git Intelligence Summary

- Recent commits show the MCP feature chain already landed in order:
  - `a1716e1 [AIX-161] Observability + resilience`
  - `df7e75b [AIX-161] cursor support`
  - `9d53c9c [AIX-161] claude support`
  - `c691cba [AIX-161] keycloak auth`
  - `003aed3 [AIX-161] ingest loop reuse`
- This story should be the release/documentation gate after those functional commits, not another rewrite of sync internals.

### Latest Technical Information

- npm Trusted Publishing uses OIDC from supported CI providers and, as of the current npm docs, requires npm CLI `11.5.1+` and Node `22.14.0+`. Source: `https://docs.npmjs.com/trusted-publishers/`
- npm Trusted Publishing from GitHub Actions can generate provenance automatically for public packages from public repositories; token-based provenance requires `id-token: write`, a GitHub-hosted runner, and `npm publish --provenance`. Source: `https://docs.npmjs.com/generating-provenance-statements/`
- npm publish cannot reuse an already-published name/version pair, even after unpublish. This makes `cli-mcp-v0.1.0` a one-way release gate. Source: `https://docs.npmjs.com/cli/v11/commands/npm-publish/`

### Project Context Reference

- Follow `_bmad-output/project-context.md`: strict TypeScript, ESM, existing package topology under `packages/tools/`, shadcn/Radix primitives in `packages/web/src/components/ui/`, and no new dependency families when existing project tools fit.
- Frontend changes must not bypass existing hooks/API clients, though this story's UI work is local setup copy and should not require new API calls.
- Controller/route changes are not expected. If any backend route changes become necessary, update Swagger and ActionPolicy coverage according to project rules.

## Dev Agent Record

### Agent Model Used

gpt-5.2-codex (Cursor Agent)

### Debug Log References

- Create-story workflow: no `sprint-status.yaml`; story key inferred as `1-7-release-versioning-gate`.
- Planning artifacts directory was empty; source context came from prior implementation stories, release plan Task 10, current repo files, and official npm docs.

### Completion Notes List

- **Release CI:** `release-cli.yml` publishes on `cli-mcp-v*`, resolves `packages/tools/db90-telemetry-mcp`, exposes `workflow_dispatch` option `mcp`, and treats MCP like Claude/Cursor for pack allowlist plus **mandatory** `node_modules/@db90/sdk/dist/**` bundle presence.
- **`@db90/telemetry-mcp` npm surface:** Added `bundledDependencies: ["@db90/sdk"]` and `prepack: node ../scripts/stage-sdk-bundle.mjs` (same pattern as Claude/Cursor).
- **Docs:** Consolidated MCP `CHANGELOG` to `[0.1.0] - 2026-05-19`; expanded `packages/tools/db90-telemetry-mcp/README.md`; rewrote `packages/tools/RELEASING.md` with MCP tag/smoke/evidence checklist; added `architecture/mcp-server.md` with Mermaid aligned to `IngestController#create` (`store_raw_event` → Temporal `Workflows::IngestionSanitizationWorkflow` → `fallback_direct_insert`).
- **Dashboard:** Claude Code Integrations sheet now uses Radix Tabs — default tab **MCP (recommended)** with `npx -y @db90/telemetry-mcp init`; optional **Standalone CLI** and **Advanced hooks** tabs unchanged in substance; Cursor path unchanged (single `npx @db90/cursor` block).
- **Tests run this session:**
  - `cd packages/tools && npm run build --workspace=@db90/sdk && npm run build --workspace=@db90/telemetry-mcp && npm test --workspace=@db90/telemetry-mcp`
  - `cd packages/tools/db90-telemetry-mcp && npm pack --dry-run` (shows bundled `@db90/sdk`).
  - `cd packages/web && npm run test:run -- src/components/integrations/IngestTokenConnectSheet.test.tsx`
  - `cd packages/web && npm run test:run` (504 tests green after `npm ci` in packages/web — local prerequisite)
  - `cd packages/web && npm run lint -- --max-warnings 999 src/components/integrations/IngestTokenConnectSheet.tsx`

**Manual verification (maintainer completes after merge — AC 19 / AC 8):** Paste into PR when done:

- Tag pushed: _(e.g. `cli-mcp-v0.1.0`)_
- Workflow run URL + status:
- `npm view @db90/telemetry-mcp version` output:
- Clean profile `npx -y @db90/telemetry-mcp@0.1.0 init` notes (issuer, OIDC quirks):
- Scripted steps wall-clock _(target ≤ ~5 min excluding admin credential hunting):_
- `db90_status` / `db90-mcp health` excerpt:

### File List

- `.github/workflows/release-cli.yml`
- `CLAUDE.md`
- `architecture/mcp-server.md`
- `packages/tools/RELEASING.md`
- `packages/tools/db90-telemetry-mcp/package.json`
- `packages/tools/db90-telemetry-mcp/CHANGELOG.md`
- `packages/tools/db90-telemetry-mcp/README.md`
- `packages/web/src/components/integrations/IngestTokenConnectSheet.tsx`
- `packages/web/src/components/integrations/IngestTokenConnectSheet.test.tsx`
- `_bmad-output/implementation-artifacts/1-7-release-versioning-gate.md`

## Change Log

- **2026-05-19** — Story created via BMad create-story workflow with release, docs, architecture, dashboard UI, testing, and manual publish/smoke-test guardrails.
- **2026-05-19** — Implemented release gate integration (workflow + SDK bundle), README/CHANGELOG/RELEASING/architecture docs, Claude Code MCP tab in ingest connect sheet + tests (`gpt-5.2-codex` dev-story pass).
