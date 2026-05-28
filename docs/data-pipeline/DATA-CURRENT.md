# DATA-CURRENT.md — current capture vs available surface

> **Co-authored document.** This file lands in two passes:
> - **Pass 1 (AIX-235)** — scaffold + cursor section (§1–§7).
> - **Pass 2 (AIX-236 · this PR)** — claude section (§8–§14) + cross-tool summary table (§15).
>
> Cross-references to `./DATA-CURSOR.md` resolve once AIX-233 merges; until then they point to the file's expected location alongside this document. Likewise, `./DATA-CLAUDE.md` resolves once AIX-234 merges.
>
> Sources of truth for what the CLIs emit: `packages/tools/db90-cursor/src/mapper.ts` (cursor) and `packages/tools/db90-claude/src/claude-reader.ts` (claude). Source of truth for the server-side vocabulary: `packages/api/app/models/tool_event.rb` + the PG enum migration. This document is descriptive, not normative — when it disagrees with the code, the code wins and this file is the bug.

---

## Table of contents

1. [Cursor — What we capture today](#1-cursor--what-we-capture-today)
2. [Cursor — What we ignore today](#2-cursor--what-we-ignore-today)
3. [Cursor — Vocabulary gaps · Rails enums](#3-cursor--vocabulary-gaps--rails-enums)
4. [Cursor — Vocabulary gaps · Web (TypeScript)](#4-cursor--vocabulary-gaps--web-typescript)
5. [Cursor — Sanitization considerations](#5-cursor--sanitization-considerations)
6. [Cursor — Proposed sub-tasks](#6-cursor--proposed-sub-tasks)
7. [Cursor — Risk & rollout](#7-cursor--risk--rollout)
8. [Claude Code — What we capture today](#8-claude-code--what-we-capture-today)
9. [Claude Code — What we ignore today](#9-claude-code--what-we-ignore-today)
10. [Claude Code — Vocabulary gaps · Rails enums](#10-claude-code--vocabulary-gaps--rails-enums)
11. [Claude Code — Vocabulary gaps · Web (TypeScript)](#11-claude-code--vocabulary-gaps--web-typescript)
12. [Claude Code — Sanitization considerations](#12-claude-code--sanitization-considerations)
13. [Claude Code — Proposed sub-tasks](#13-claude-code--proposed-sub-tasks)
14. [Claude Code — Risk & rollout](#14-claude-code--risk--rollout)
15. [Cross-tool summary](#15-cross-tool-summary)

---

## 1. Cursor — What we capture today

Validated against `packages/tools/db90-cursor` at HEAD of `feature/AIX-235-cursor-review-data-being-sent-by-db-90-tools` (`mapper.ts`, `sync.ts`, `cursor-reader.ts`, `collect-payloads.ts`). Three emit paths are mapped in `mapper.ts` and **all are wired in `sync.ts`** via `collectSyncPayloads` (`sync.ts` + `collect-payloads.ts`). Numeric and metadata field names are taken verbatim from the `Db90Payload` interface (`mapper.ts:45-55`) and the `Db90PayloadMetadata` type (`mapper.ts:30-43`).

### 1a. Path A — Daily stats (tab + composer aggregates)

Reads `state.vscdb` → `ItemTable` keys `aiCodeTracking.dailyStats.v*.<DATE>` (date suffix match in `cursor-reader.ts`; v1.5 is what Cursor writes today). Handled by `mapDailyStats` (`mapper.ts:164-222`). Emits **one to two** payloads per `<DATE>` row. Version inventory: `npm run audit:local-stores` → `daily_stats_versions` (CUR-V11).

| Domain | Field | Source (mapper.ts line) | Stored as | Enum value used |
|---|---|---|---|---|
| Identity | `tool_name` | `139` | `tool_events.tool_name` | `cursor` |
| Identity | `model` | `141`, default `"unknown"` | `tool_events.model` | n/a |
| Classification | `event_type` (tab) | `184` | `tool_events.event_type` | `completion` |
| Classification | `event_type` (composer) | `195` | `tool_events.event_type` | `chat` |
| Metric | `tokens_in` (tab) | `185` ← `tabSuggestedLines` | `tool_events.tokens_in` | n/a |
| Metric | `tokens_out` (tab) | `186` ← `tabAcceptedLines` | `tool_events.tokens_out` | n/a |
| Metric | `tokens_in` (composer) | `196` ← `composerSuggestedLines` | `tool_events.tokens_in` | n/a |
| Metric | `tokens_out` (composer) | `197` ← `composerAcceptedLines` | `tool_events.tokens_out` | n/a |
| Cost | `cost_usd` | `189` / `198` via `computeLineCost` | `tool_events.cost_usd` | n/a |
| Time | `occurred_at` | `170` (`${date}T00:00:00.000Z`, day-bucket) | `tool_events.occurred_at` | n/a |
| Project | `project_id` | `148`, optional | `tool_events.project_id` | n/a |
| Metadata | `cursor_session_id` | `146`, hardcoded `null` for dailyStats | `metadata.cursor_session_id` | n/a |
| Metadata | `workspace` | `146` ← `dbPath` | `metadata.workspace` | n/a |
| Metadata | `cost_model` | `146` ← constant `"estimated_line_count"` (`mapper.ts:3`) | `metadata.cost_model` | n/a |
| Metadata | `scannable` | `146`, hardcoded `false` | `metadata.scannable` | n/a |
| Metadata | `risk_level` | `146`, hardcoded `"none"` | `metadata.risk_level` | n/a |

### 1b. Path B — Recent commit snapshot

Reads `state.vscdb` → `ItemTable.aiCodeTracking.recentCommit` (one row per install, overwritten on each new commit; key constant at `cursor-reader.ts:347`). Handled by `mapRecentCommit` (`mapper.ts:228-283`). Wired in `sync.ts` via `readRecentCommitSnapshots` + separate `lastRecentCommitAt` watermark. Emits **at most one** payload per sync when the row is newer than the watermark.

| Domain | Field | Source (mapper.ts line) | Stored as | Enum value used |
|---|---|---|---|---|
| Identity | `tool_name` | `258` | `tool_events.tool_name` | `cursor` |
| Identity | `model` | `260`, hardcoded `"unknown"` | `tool_events.model` | n/a |
| Classification | `event_type` | `260` | `tool_events.event_type` | `commit` |
| Metric | `tokens_in` | `261` ← `linesAdded + tabLinesAdded + composerLinesAdded` (proxy) | `tool_events.tokens_in` | n/a |
| Metric | `tokens_out` | `262` ← `linesDeleted + tabLinesDeleted + composerLinesDeleted` (proxy) | `tool_events.tokens_out` | n/a |
| Cost | `cost_usd` | `263` via `computeLineCost("chat", ...)` | `tool_events.cost_usd` | n/a |
| Time | `occurred_at` | `234`, ISO from `obj.timestamp` | `tool_events.occurred_at` | n/a |
| Metadata | `source` | `269`, constant `"recent_commit"` | `metadata.source` | n/a |
| Metadata | `commit_hash` | `270` | `metadata.commit_hash` | n/a |
| Metadata | `commit_message` | `271` | `metadata.commit_message` | n/a |
| Metadata | `repo_name` | `272` | `metadata.repo_name` | n/a |
| Metadata | `branch_name` | `273` | `metadata.branch_name` | n/a |
| Metadata | `ai_percentage` | `274-276` | `metadata.ai_percentage` | n/a |
| Metadata | `cursor_session_id` | `266`, hardcoded `null` | `metadata.cursor_session_id` | n/a |
| Metadata | `workspace` | `267` ← `dbPath` | `metadata.workspace` | n/a |
| Metadata | `cost_model` | `268` ← `"estimated_line_count"` | `metadata.cost_model` | n/a |
| Metadata | `scannable` | `277`, hardcoded `false` | `metadata.scannable` | n/a |
| Metadata | `risk_level` | `278`, hardcoded `"none"` | `metadata.risk_level` | n/a |

### 1c. Path C — Legacy per-request row

Reads workspace `cursor.db` → `CursorRequestFeedback` table. Handled by `mapEvent` (`mapper.ts:285-319`). One payload per row. Only path that carries real per-request token counts (`promptTokens` / `generatedTokens`).

**CUR-V07 (May 2026):** Ana's Mac — `findCursorDbs` → **0** files, global `state.vscdb` → **19** `dailyStats` keys, sync `legacy=0`. Treat Path C as **inactive on modern Cursor**; keep the reader for older installs. Audit: `npm run audit:local-stores` in `db90-cursor`.

| Domain | Field | Source (mapper.ts line) | Stored as | Enum value used |
|---|---|---|---|---|
| Identity | `tool_name` | `302` | `tool_events.tool_name` | `cursor` |
| Identity | `model` | `304` ← `row.model` (rejected if absent — `295`) | `tool_events.model` | n/a |
| Classification | `event_type` | `297` ← `row.type === 1 ? "chat" : "completion"` | `tool_events.event_type` | `chat` or `completion` |
| Metric | `tokens_in` | `305` ← `row.promptTokens` | `tool_events.tokens_in` | n/a |
| Metric | `tokens_out` | `306` ← `row.generatedTokens` | `tool_events.tokens_out` | n/a |
| Cost | `cost_usd` | `307` via `computeTokenCost` | `tool_events.cost_usd` | n/a |
| Time | `occurred_at` | `291` from `row.timestamp` | `tool_events.occurred_at` | n/a |
| Metadata | `cursor_session_id` | `310` ← `row.sessionId ?? row.requestId` | `metadata.cursor_session_id` | n/a |
| Metadata | `workspace` | `311` ← `workspacePath` | `metadata.workspace` | n/a |
| Metadata | `cost_model` | `329` ← `"token_count"` (CUR-V10) | `metadata.cost_model` | n/a |
| Metadata | `scannable` | `313`, hardcoded `false` | `metadata.scannable` | n/a |
| Metadata | `risk_level` | `314`, hardcoded `"none"` | `metadata.risk_level` | n/a |

### 1d. Model-keyed fallback path (subset of Path A)

When `mapDailyStats` finds no line-count keys, it iterates over the remaining object entries (`mapper.ts:204-219`) and emits one `chat` payload per model bucket holding `inputTokens` / `outputTokens`. The metadata shape is identical to Path A; the only difference is `model` is set to the bucket key instead of `"unknown"`. This branch is dead code on `v1.5` installs today but ships as forward-compat for `v1.6+`.

### 1e. Sync orchestration (AIX-235)

| Concern | Implementation |
|---|---|
| Read + map | `collectSyncPayloads` (`collect-payloads.ts`) — legacy rows, deduped daily stats, recent commit |
| Post | `sync.ts` — aggregate events and commits in separate batches; advances `lastProcessedAt` + `lastRecentCommitAt` in `~/.db90-cursor/state.json` |
| Daily-stats dedupe | `dedupeDailyStatsEntries` (`cursor-reader.ts`) — per calendar date, prefer `globalStorage/state.vscdb` over workspace copies (CUR-V06) |
| Dry-run contract | `validateCursorPayload` (`payload-contract.ts`) — checks payloads against DATA-CURSOR.md §3.5 |
| Full rescan | CLI `--full` ignores watermark; `npm run verify:dry-run-matrix` always uses `since: null` |

### 1f. Project attribution (CUR-V04)

| Event paths | How `project_id` is chosen |
|---|---|
| Daily stats, legacy `cursor.db` | **Batch only:** CLI `--project-id` → config `project_id` → CWD `git remote` lookup (`resolveProjectId`). Same `project_id` on every payload in the sync. |
| Recent commit (`recentCommit`) | **Batch first** at map time, then **`enrichCommitProjectAttribution`** unless user set flag/config: derives git remotes from `metadata.repo_name` (`owner/repo` → `https://github.com/owner/repo`, `git@github.com:owner/repo.git`) and calls `GET /api/v1/projects/lookup`. On match, **overrides** batch `project_id` (fixes sync-from-wrong-directory). |
| Explicit override | `--project-id` or config `project_id` wins for **all** paths including commits — repo lookup skipped. |

`metadata.repo_name` always reflects Cursor’s commit row regardless of attribution. Dashboards can show repo/branch even when `project_id` is null (no matching DB90 project).

### 1g. Workspace metadata (CUR-V05)

| Field | Meaning |
|---|---|
| `metadata.workspace` | **Unchanged:** absolute path to `state.vscdb` (daily stats, recent commit) or `workspaceStorage/<hash>/` directory (legacy `cursor.db`). Stable ingest key; do not repurpose for display. |
| `metadata.workspace_scope` | `global` — install-wide `globalStorage/state.vscdb` (aggregates all folders). `workspace` — per-hash store under `workspaceStorage/`. |
| `metadata.workspace_folder` | Optional. Resolved from `workspace.json` → `folder` / `folders[0].path` file URI when the store is workspace-scoped and the file exists. Omitted for global DBs. |

**Decision:** keep `workspace` as the DB path for backward compatibility; use `workspace_folder` for human-readable project paths in dashboards. MCP transcript events may omit `workspace_scope` (they already carry composer/fs paths).

### Cross-cutting notes (validated against `mapper.ts` + `sync.ts`)

- `tool_name` is **always** `"cursor"` (type-narrowed at `mapper.ts:46`).
- `event_type` is one of `"completion"`, `"chat"`, or `"commit"` (`mapper.ts:47`) — Path B emits `"commit"` since AIX-235.
- `scannable: false` and `risk_level: "none"` are emitted by all three paths because cursor never ships scannable text payloads. They exist in the metadata schema only to keep the server-side risk-scanning pipeline a no-op for cursor events.
- `cost_model` is `"estimated_line_count"` on every path, including Path C where it is technically wrong (Path C does carry real tokens). Cleanup is captured in §6.
- `cursor_session_id` is populated only on Path C. Paths A and B have it as `null`, which means the `ToolEvents::Upsert` dedup path (which keys on `metadata.session_id`, see `upsert.rb:32-34`) does **not** apply to dailyStats or recent-commit events. They follow a different idempotency story driven by `(organization_id, occurred_at, event_type)` natural keys at the database layer.

---

## 2. Cursor — What we ignore today

Cross-refs are forward-links into `./DATA-CURSOR.md` (AIX-233). Until that file lands, the sub-section anchors below should be read as named hooks for the upcoming surface map.

| Source field / signal | What it would tell us | Mapper.ts treatment | DATA-CURSOR.md anchor |
|---|---|---|---|
| `aiCodeTracking.dailyStats.v1.5.<DATE>.<modelKey>.inputTokens` (when present) | Per-model breakdown of daily activity | Only consumed if all four line-count keys are zero (`mapper.ts:204-219`); never combined with line-count rows | `./DATA-CURSOR.md#dailystats-model-buckets` |
| `aiCodeTracking.dailyStats.<other versions, e.g. v1.6>` | New Cursor schema versions | Keys are read if they end with `YYYY-MM-DD`; mapper may not understand new JSON shapes | `cursor-6` — `audit:local-stores` / CUR-V11 |
| `aiCodeTracking.recentCommit.aiPercentage` | % of commit attributable to AI | Emitted as `metadata.ai_percentage` on Path B (`event_type: commit`) | `./DATA-CURSOR.md#recent-commit` |
| `cursorDiskKV` table — `composerData:<uuid>` blobs | Per-composer-session granular events (start, end, model, edits) | Not read | `./DATA-CURSOR.md#cursordiskkv-composer-sessions` |
| `cursorDiskKV` table — `bubbleId:<uuid>` blobs | Bubble graph (individual chat turns within a composer session) | Not read | `./DATA-CURSOR.md#cursordiskkv-bubbles` |
| `cursorDiskKV` table — `mcp*` keys | MCP server invocations from Cursor | Not read | `./DATA-CURSOR.md#mcp-tool-calls` |
| `cursorDiskKV` table — `inlineDiff*` keys | Cmd+K inline edit acceptance/rejection | Not read | `./DATA-CURSOR.md#inline-edits` |
| BugBot review activity | AI PR-review event volume | Not in local SQLite; lives in Cursor cloud | `./DATA-CURSOR.md#bugbot` |
| Background-agent runs | Long-running agent activity | No local store identified | `./DATA-CURSOR.md#background-agents` |
| Per-language stats | Language breakdown of suggestions | Schema does not split by language | `./DATA-CURSOR.md#language-breakdown` |
| Tab acceptance rate (derived) | `tabAcceptedLines / tabSuggestedLines` | Computable downstream but not surfaced as a first-class metric | `./DATA-CURSOR.md#derived-metrics` |
| Workspace name (human-readable) | Project attribution beyond `dbPath` | `workspace` metadata is the raw SQLite file path, not the user-facing workspace name | `./DATA-CURSOR.md#workspace-resolution` |
| Cursor CLI version | Schema drift attribution | Not extracted; would let us correlate ingest anomalies to Cursor upgrades | `./DATA-CURSOR.md#cursor-version` |

---

## 3. Cursor — Vocabulary gaps · Rails enums

### 3a. Live PG ↔ Ruby enum divergence (present-day, not hypothetical)

The repo already has a three-way divergence between the Postgres `event_type` enum, the Ruby `ToolEvent::EVENT_TYPES` constant, and the values actually emitted by controllers. Any new cursor-side proposal must close this gap before stacking more values on top.

| Layer | Source | Values |
|---|---|---|
| Postgres `public.event_type` ENUM | `packages/api/db/migrate/20260125224539_enable_timescale_db_and_create_enums.rb:38-42` | `chat`, `completion`, `edit`, `commit`, `review`, `test`, `debug`, `refactor`, `documentation`, `other` _(10 values)_ |
| Ruby `ToolEvent::EVENT_TYPES` | `packages/api/app/models/tool_event.rb:12-13` | `chat`, `completion`, `edit`, `commit`, `review`, `test`, `debug`, `refactor`, `documentation`, `other`, **`issue`**, **`comment`**, **`sprint`**, **`tool_use`** _(14 values; bolded 4 not in PG)_ |
| Controller (active emitter) | `packages/api/app/controllers/api/v1/telemetry_controller.rb:147` | Sends `event_type: "tool_use"` — **a value Postgres will reject as enum-out-of-range on insert** |

This is a live bug, not a stylistic nit. The Ruby validator passes (because `EVENT_TYPES` includes `tool_use`) but the underlying column type does not. Any production insert through `telemetry_controller#claude_hook` with the PostToolUse branch will raise `PG::InvalidTextRepresentation`. Reproduction path: configure a Claude Code hook that posts to `/api/v1/telemetry/claude-hook` with `params[:hook_event] == "PostToolUse"`.

**Invariant we need going forward:** `public.event_type` ENUM and `ToolEvent::EVENT_TYPES` are a single conceptual list. Either:
- the model constant must be generated from `pg_type` at boot (and CI rejects manual edits), or
- a migration is the only way to extend `EVENT_TYPES`, and the constant is read from a single source.

Captured as a sub-task in §6 (Schema · `cursor-3`).

### 3b. Proposed `event_type` additions (cursor-driven)

Each is a concrete cursor signal already detectable in `state.vscdb` (or extractable from `cursorDiskKV`). All additions require a migration **and** a constant update **and** swagger update.

| Proposed enum value | When emitted | Source today (file/row) | Notes |
|---|---|---|---|
| `tab_completion` | Tab-style autocomplete acceptance event | `aiCodeTracking.dailyStats.*.tabAcceptedLines` | More precise than the current generic `completion`. Could co-exist with `completion` as the daily-aggregate value. |
| `tab_acceptance` | Per-acceptance event (one event per accepted suggestion) | Not stored locally today; would need an inlineDiff parser | Optional — only useful if we move from aggregates to per-event ingest. |
| `composer_chat` | Composer Cmd+I / chat-panel turn | `cursorDiskKV` → `composerData:<uuid>` / `bubbleId:<uuid>` | Distinguishes from inline edit. |
| `composer_agent` | Cursor agent-mode (multi-step composer run with tool calls) | `cursorDiskKV` → composer entries marked as agent runs | Maps onto the same conceptual surface as Claude Code sub-agents (§15 row). |
| `mcp_tool_call` | MCP server call dispatched from Cursor | `cursorDiskKV` → `mcp*` keys | Parallels Claude Code's tool_use blocks. |
| `inline_edit` | Cmd+K inline edit | `cursorDiskKV` → `inlineDiff*` keys | Currently silently rolled into `chat`. |
| `background_agent_run` | Long-running background agent | No local store identified; cloud-only | Lowest-priority — gated on Cursor exposing it. |

### 3c. Proposed standardized `metadata.*` keys

These exist (in some form) on the wire today but are not part of a documented schema. Standardizing them lets dashboards and analytics queries assume the keys are present and typed.

| Key | Type | Source | Status today | Proposal |
|---|---|---|---|---|
| `composer_id` | string (uuid) | `cursorDiskKV → composerData:<uuid>` | Not extracted | Add when emitting `composer_chat` / `composer_agent` |
| `agent_id` | string | `cursorDiskKV → background-agent rows` | Not extracted | Add when emitting `background_agent_run` |
| `mcp_server` | string | `cursorDiskKV → mcp*` | Not extracted | Add when emitting `mcp_tool_call` |
| `accepted_lines` | integer | `aiCodeTracking.dailyStats.*.tabAcceptedLines` | Today this lands in `tokens_out` (which is overloaded) | Make a dedicated key so `tokens_out` can hold a real token count when one exists |
| `ai_percentage` | number (0–100) | `aiCodeTracking.recentCommit.aiPercentage` | Already emitted, but key is not documented | Document and pin shape |
| `branch_name` | string | `aiCodeTracking.recentCommit.branchName` | Already emitted, but key is not documented | Document and pin shape |
| `commit_hash` | string | `aiCodeTracking.recentCommit.commitHash` | Already emitted, but key is not documented | Document and pin shape |
| `cursor_version` | string | Cursor app version on disk | Not extracted | Useful for schema-drift attribution (`v1.5` → `v1.6` upgrades) |

Swagger update (`packages/api/swagger/v1/swagger.yaml`, Ingest section, ~lines 1380–1480) is part of every metadata-key addition — the schema becomes the contract.

---

## 4. Cursor — Vocabulary gaps · Web (TypeScript)

There is a fourth divergence on top of §3a: the web TS layer has its own taxonomy that does not match either Ruby or Postgres, and the events-page filter component hardcodes a fifth list that does not match anything.

| Layer | Source | Values |
|---|---|---|
| Web `EventType` union | `packages/web/src/lib/types.ts:214-222` | `completion`, **`prompt`**, `chat`, `edit`, **`generation`**, `commit`, `review`, `other` _(bold = values not in any backend enum)_ |
| Web hardcoded events-filter list | `packages/web/src/components/events/EventFilters.tsx:50-55` | `prompt`, `completion`, **`function_call`**, **`file_operation`** _(bold = values not in any backend enum and not in the TS union)_ |
| Web tool-filter list | `packages/web/src/lib/eventsToolFilters.ts:12-18` | `github_copilot`, `claude_code`, `cursor`, `aider`, `tabnine` |

Consequences:
- Users can filter for `function_call` or `file_operation` events in the UI and will always get zero results — those values are never emitted.
- `prompt` and `generation` in the TS union are dead values; nothing in `mapper.ts` or `claude-reader.ts` emits them.
- Any new cursor `event_type` (§3b) requires four synchronized changes: PG migration, Ruby constant, TS union, and **either** removing the hardcoded list in `EventFilters.tsx` or extending it to match.

### Required follow-ups on the web side, by file

- `packages/web/src/lib/types.ts:214-222` — drop `prompt` and `generation`; add new cursor values (`tab_completion`, `composer_chat`, `composer_agent`, `mcp_tool_call`, `inline_edit`, `tab_acceptance`, `background_agent_run`).
- `packages/web/src/components/events/EventFilters.tsx:50-55` — replace hardcoded array with a constant imported from `lib/types.ts` (single source of truth) or, better, fetch from `GET /events/summary` so the filter only shows values actually present in the org's data (this is the pattern already used for tools per the AIX-115 PR landed at `5a1995b`).
- `packages/web/src/lib/eventsToolFilters.ts:12-18` — no changes required for cursor in this task, but the tool list is a parallel divergence example worth noting (`continue`, `cody`, `amazon_q`, `windsurf` exist in the backend enum but are not in the UI dropdown).
- `ToolEvent` interface (`lib/types.ts:224-250`) — `eventType: EventType` will narrow correctly once the union is extended; no field-shape changes needed, but the `metadata?: Record<string, unknown> | null` field deserves a typed sub-interface for the standardized `metadata.*` keys proposed in §3c so consumers don't have to defensively cast.

---

## 5. Cursor — Sanitization considerations

The `SanitizationPolicy` defined in `packages/api/db/seeds.rb:7-35` covers six patterns: `api_key`, `aws_secret`, `private_key`, `email`, `phone`, `ssn`. None of the cursor proposals capture freeform user prompt text (that's out of scope for this epic per §7 below and the §7 of `TOKENS.md`). The remaining text-bearing proposed fields are still worth a pass:

| Proposed field (§3b/§3c) | Text-bearing? | Existing policy sufficient? | Notes |
|---|---|---|---|
| `metadata.commit_message` _(already emitted today, validated post-hoc)_ | Yes | **Partial** — covers credentials and PII, but not internal hostnames, repo URLs, JIRA ticket bodies, customer names. | Commit messages can leak internal context. Recommend extending policy with `internal_hostname` + `customer_identifier` patterns before broadening intake. Captured as `cursor-7`. |
| `metadata.branch_name` | Yes (low-risk) | Yes | Branch names occasionally contain ticket IDs with customer context (e.g. `fix/acme-billing-bug`); acceptable risk but flag. |
| `metadata.composer_id` | No (UUID) | n/a | Pure identifier. |
| `metadata.agent_id` | No | n/a | Pure identifier. |
| `metadata.mcp_server` | Yes (server name) | Yes | Server names are user-defined but rarely contain secrets; document as low-risk. |
| `metadata.commit_hash` | No (hex hash) | n/a | Pure identifier. |
| `metadata.ai_percentage` | No (number) | n/a | Numeric. |
| `metadata.cursor_version` | No (semver string) | n/a | Bounded enum-like. |
| `metadata.repo_name` | Yes (low-risk) | Yes | Public repo names safe; private repo names may reveal customer or project. Document as advisory. |

**New policy rules recommended** (captured as sub-task `cursor-7`):

1. `internal_hostname` — regex matching `*.example.com`, `*.db90.io`, and the staging hostnames listed in `.env.example`.
2. `customer_identifier` — regex matching the org-configurable list of customer codenames (or a hash thereof). Tenant-scoped.
3. **Field-level allow-listing** — for cursor-side metadata, only the keys enumerated in `Db90PayloadMetadata` should be accepted; unknown keys should be dropped server-side rather than persisted. Today `ingest_controller.rb:127-133` uses `params.permit(... metadata: {})`, which accepts any nested structure. Tightening this means the policy is enforceable at ingest, not just at scan time.

**Out-of-scope reminder:** prompt text capture (full composer transcripts, etc.) is explicitly excluded by this epic's scope. Anything in §5 above is about metadata fields, not raw user content.

---

## 6. Cursor — Proposed sub-tasks

Each item is sized to one PR. Tags: `[Schema]` `[Extractor]` `[Sanitization]` `[Front-end]`. Order is dependency-ordered: schema first, extractor next, sanitization in parallel, front-end last.

| ID | Tag | Title | Concrete change | Files touched |
|---|---|---|---|---|
| `cursor-1` | Schema | Add `commit` enum guardrail + retag cursor recent-commit | ✅ **Shipped (AIX-235)** — `mapRecentCommit` emits `event_type: "commit"`; wired in `sync.ts`. Optional follow-up: backfill historic rows tagged `chat` via rake task. | `packages/tools/db90-cursor/src/mapper.ts`, `packages/api/lib/tasks/backfill_recent_commit_event_type.rake` _(optional)_ |
| `cursor-2` | Schema | Extend `event_type` PG enum + Ruby constant + Swagger | Migration adds `tab_completion`, `composer_chat`, `composer_agent`, `mcp_tool_call`, `inline_edit`, `tab_acceptance`, `background_agent_run`. Update `EVENT_TYPES` constant and `swagger.yaml` in the same commit. | `packages/api/db/migrate/<new>.rb`, `packages/api/app/models/tool_event.rb:12-13`, `packages/api/swagger/v1/swagger.yaml` (Ingest section ~lines 1380–1480) |
| `cursor-3` | Schema | PG↔Ruby enum-invariant CI check | Rake/CI job that diffs `pg_enum` rows against `ToolEvent::EVENT_TYPES`; fails build on drift. Closes the live divergence documented in §3a (`tool_use`, `issue`, `comment`, `sprint` in Ruby but not PG). Also fix the live bug by either adding the missing PG values or removing them from Ruby. | `packages/api/lib/tasks/enum_invariant_check.rake` _(new)_, CI workflow update |
| `cursor-4` | Extractor | Surface `recentCommit.aiPercentage`, `branchName`, `commitHash` as documented `metadata.*` keys | They're already on the wire (per `mapper.ts:269-279`) but undocumented. Add Swagger schema and TS types. **From TOKENS.md §8 item 3.** | `packages/api/swagger/v1/swagger.yaml`, `packages/web/src/lib/types.ts:224-250` |
| `cursor-5` | Extractor | Read `cursorDiskKV` composer sessions | New parser module that scans `cursorDiskKV` for `composerData:<uuid>` blobs, walks the bubble graph, and emits one `composer_chat` (or `composer_agent`) event per session with `composer_id`, `model`, `mcp_server` (if used). **From TOKENS.md §8 item 1 (cursor side).** | `packages/tools/db90-cursor/src/cursor-disk-kv-reader.ts` _(new)_, `packages/tools/db90-cursor/src/mapper.ts`, `packages/tools/db90-cursor/src/index.ts` |
| `cursor-6` | Extractor | Version-prefix discovery + mapper for new shapes | ✅ Discovery shipped in `audit:local-stores` (`daily-stats-versions.ts`, CUR-V11). Remaining: mapper/log when `v1.6+` JSON differs from v1.5 line layout. | `packages/tools/db90-cursor/src/daily-stats-versions.ts` |
| `cursor-7` | Sanitization | Extend policy with internal-hostname + customer-identifier patterns | Per §5. Add two regex patterns + redact actions to the default `SanitizationPolicy` seed; backfill `seeds.rb:7-35`; document override mechanism (org-level patterns). | `packages/api/db/seeds.rb:7-35`, `packages/api/app/services/sanitization_service.rb` (if present) |
| `cursor-8` | Sanitization | Server-side metadata allow-list | Tighten `ingest_controller.rb#permitted_params` so `metadata` accepts only the documented standardized keys; unknown keys are dropped (logged at `:info`). Stops payload-shape drift from the CLI side bypassing the documented schema. | `packages/api/app/controllers/api/v1/ingest_controller.rb:127-133` |
| `cursor-9` | Front-end | Replace hardcoded `eventTypes` in `EventFilters.tsx` with summary-driven options | Mirrors the AIX-115 pattern for the tool filter: fetch event-type options from `GET /events/summary` so the UI only shows values present in the org's data. Removes the stale `function_call` / `file_operation` values (per §4). | `packages/web/src/components/events/EventFilters.tsx:50-55`, `packages/web/src/hooks/useEventsSummary.ts` _(new or existing)_ |
| `cursor-10` | Front-end | Recent-commit detail card on event drawer | ✅ Shipped (CUR-V15) — `RecentCommitDetail` when `event_type=commit` or `metadata.source=recent_commit`. | `packages/web/src/components/events/RecentCommitDetail.tsx`, `EventDrawer.tsx`, `EventDetail.tsx` |

**Group coverage:** Schema (3) · Extractor (3) · Sanitization (2) · Front-end (2) — all four groups, ten total. Exceeds the ≥ 6 / ≥ 3-of-4 bar.

---

## 7. Cursor — Risk & rollout

| Concern | Detail | Mitigation |
|---|---|---|
| TimescaleDB compression after 7 days | `tool_events` is a hypertable; rows older than 7 days are compressed (chunk-level). Adding columns or changing column types after compression requires uncompress → alter → recompress, which is expensive on the prod hypertable. | All new fields land in `metadata` (JSONB) rather than as new columns. The proposals in §3b/§3c follow this discipline by design. New top-level columns (e.g. `prompt_text`) are explicitly out-of-scope. |
| Retention windows | `tool_events_retention` enum (`30/60/90/180/365/730 days` per the migration) determines how long raw events live before drop. New event types inherit retention by default — no per-type policy. | Document as expected. If a new event type (e.g. `mcp_tool_call`) has substantially different volume, propose a per-type retention story in a follow-up — not in scope for §6. |
| Unique-on-session-id upsert | `ToolEvents::Upsert` (`packages/api/app/services/tool_events/upsert.rb:32-34`) dedups on `metadata->>'session_id'` under advisory lock. Cursor paths A and B emit `cursor_session_id: null`, so neither benefits from this dedup. Cursor path C populates `cursor_session_id` but the dedup key looks for `session_id`, not `cursor_session_id` — they will not collide. | Sub-task `cursor-5` (composerData parser) should emit `metadata.session_id` (canonical key) using the composer UUID, so cursor composer events get the same dedup treatment as Claude Code sessions. Document the `cursor_session_id` legacy key as superseded. |
| `v1.6+` dailyStats JSON shape | Dated keys are ingested, but unknown field layouts may map to zero payloads. | Run `npm run audit:local-stores` — flags `has_version_newer_than_v1_5` and unmatched keys (CUR-V11). Extend mapper when a new version appears on hardware. |
| Backfill on retag (`cursor-1`) | Changing `event_type` on existing rows means dashboards that group by `event_type` will appear to retroactively change. | Backfill rake task should write to `metadata.previous_event_type` so we have an audit trail. Coordinate with whichever dashboards group by `event_type` (the `WeeklyToolUsageChart` and `RiskAlertsTable` from PR #151 merged at `0ceaa46`). |
| Mapper line-count clamping | `mapper.ts:81` clamps negative tokens to zero defensively. If we expose `accepted_lines` as its own metadata key (per §3c), the same clamping discipline must apply. | Keep `nn(n)` helper as the single chokepoint; new fields go through it. |

---

## 8. Claude Code — What we capture today

Validated against `packages/tools/db90-claude/src/claude-reader.ts` at HEAD of `feature/AIX-235-review-cursor-data-sent` (identical to the file on `feature/AIX-234-available-data-from-claude-code`). One emit path: per-session aggregation of `assistant` lines in every `*.jsonl` transcript discovered under `~/.claude/projects/` and `~/.config/claude/projects/`. Every field that actually goes on the wire is listed below; the `Db90Payload` interface is the contract (`claude-reader.ts:56-78`).

### 8a. Single emit path — per-session JSONL aggregation

`findTranscriptFiles` (`claude-reader.ts:96-111`) → `parseTranscriptFile` (`claude-reader.ts:120-226`) → `toDb90Payload` (`claude-reader.ts:229-267`). One payload per `sessionId` per sync. Re-sends as the JSONL grows are deduplicated server-side by `ToolEvents::Upsert` (`packages/api/app/services/tool_events/upsert.rb:32-34, 78-83`) keyed on `metadata.session_id`.

| Domain | Field | Source (claude-reader.ts line) | Stored as | Enum value used |
|---|---|---|---|---|
| Identity | `tool_name` | `240`, type-narrowed at `57` | `tool_events.tool_name` | `claude_code` |
| Identity | `model` | `258`, only set if `agg.model` non-null; sourced from `entry.message.model` at `176` (last-seen wins, `199-200`) | `tool_events.model` | n/a |
| Classification | `event_type` | `241`, type-narrowed at `58` (constant string literal) | `tool_events.event_type` | `chat` |
| Metric | `tokens_in` | `259` — only emitted if `> 0`. Sum at `169-172`: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` | `tool_events.tokens_in` | n/a |
| Metric | `tokens_out` | `260` — only emitted if `> 0`. Sum at `195` from `usage.output_tokens` (`173`) | `tool_events.tokens_out` | n/a |
| Metric | `tokens_total` | `261-263`, set only when `tokens_in + tokens_out > 0` | `tool_events.tokens_total` | n/a |
| Cost | `cost_usd` | `242`, via `calculateCost(...)` at `235-237` when `pricing` provided; otherwise `null` | `tool_events.cost_usd` | n/a |
| Time | `occurred_at` | `243` ← `agg.occurredAt`, updated at `201-202` to the **latest** assistant timestamp in the session | `tool_events.occurred_at` | n/a |
| Project | `project_id` | `264`, only set when caller passes `options.projectId` (resolved via `resolveProjectId` in `project-resolver.ts`) | `tool_events.project_id` | n/a |
| Metadata | `session_id` | `245` ← `entry.sessionId` (`156, 166`) | `metadata.session_id` (canonical dedup key) | n/a |
| Metadata | `model` | `246` ← `agg.model` (nullable mirror of `entry.message.model`) | `metadata.model` | n/a |
| Metadata | `base_input_tokens` | `247` ← `Math.max(0, tokensIn - cacheWrite - cacheRead)` decomposed at `234` | `metadata.base_input_tokens` | n/a |
| Metadata | `output_tokens` | `248` ← `agg.tokensOut` (mirror of `tokens_out`) | `metadata.output_tokens` | n/a |
| Metadata | `cache_write_tokens` | `249` ← `agg.cacheWriteTokens`, accumulated from `usage.cache_creation_input_tokens` at `174, 197` | `metadata.cache_write_tokens` | n/a |
| Metadata | `cache_read_tokens` | `250` ← `agg.cacheReadTokens`, accumulated from `usage.cache_read_input_tokens` at `175, 198` | `metadata.cache_read_tokens` | n/a |
| Metadata | `risk_level` | `251` ← `agg.riskLevel`, populated in the per-session post-pass at `215-222` by `scanText` | `metadata.risk_level` | n/a |
| Metadata | `risk_categories` | `252` ← `agg.riskCategories`, populated at the same step | `metadata.risk_categories` | n/a |
| Metadata | `risk_score` | `253` ← `agg.riskScore`, populated at the same step | `metadata.risk_score` | n/a |
| Metadata | `scannable` | `254`, hardcoded `true` (constant in the type at `76`) | `metadata.scannable` | n/a |

### 8b. Cross-cutting notes (validated against `claude-reader.ts`)

- `tool_name` is **always** `"claude_code"` (type-narrowed at `57`).
- `event_type` is **always** `"chat"` (type-narrowed at `58`) — even when the session contains `Edit`, `Write`, `MultiEdit`, `Bash(git commit ...)`, or `Task(subagent_type=...)` content blocks. This is the parallel of the cursor recent-commit mis-tag (§1b) but **larger in scope**: every Claude Code feature collapses into one event_type today (the 1/12 enum coverage cited in TOKENS.md §1).
- `scannable: true` is the **single divergence from cursor's metadata shape**. It instructs `ClassificationActivity` (`temporal/activities/classification_activity.rb:30-44`) to take "Path 2" — trust the CLI's pre-scan output verbatim and **skip server-side scanning + sanitization** (`requires_sanitization` is hardcoded to `false`). This means the CLI is the single point of trust for claude content classification.
- `risk_level` / `risk_categories` / `risk_score` are computed by `scanText` (`risk-scanner.ts`) over the **concatenated user-turn text** for the session (`claude-reader.ts:204-208, 215-222`). The user text itself is held in memory inside `parseTranscriptFile` and **never persisted, never POSTed** — only the derived classification leaves the host.
- `cost_usd` is computed client-side using `pricing.ts` when `options.pricing` is passed (the default path through `syncOnce` → `getDefaultPricing`). Otherwise it lands as `null` and the server fills it in via `Upsert#enrich_cost!` (`upsert.rb:51-67`) using `ModelPricingService`, then stamps `metadata.cost_source = "server_estimated"`. When client cost is non-null it stamps `"client"`. **Asymmetry vs cursor:** cursor `metadata.cost_model = "estimated_line_count"` is set by the CLI; the `cost_source` key on the server side is independent and downstream.
- `session_id` is **always** populated and uses the JSONL `sessionId` (a UUID). This means every claude event goes through the `pg_advisory_xact_lock(crc32(session_id))` upsert path (`upsert.rb:77-83`) — distinct from cursor paths A/B which emit `cursor_session_id: null` and fall back to the unconditional create path.
- The "last-seen model wins" semantic at `199-200` is **load-bearing for cost accuracy**. When a session uses multiple models (e.g. the engineer switches Opus → Sonnet mid-session), the `metadata.model` will be whichever model was last in the JSONL when sync ran. `pricing.ts:33-111` then bills *all* tokens at that model's rate, even though the actual mix was split. `pricing.ts` header comment acknowledges this as a known approximation.
- The **5m vs 1h cache TTL split** (`usage.cache_creation.ephemeral_5m_input_tokens` vs `ephemeral_1h_input_tokens`, per `DATA-CLAUDE.md` §2.4 + §4.1) is **collapsed** by `claude-reader.ts:174` reading only the rollup `cache_creation_input_tokens`. Anthropic bills the two TTL buckets at different multipliers (1.25× vs 2× base), so we systematically undercount cost on 1h-TTL sessions.
- `requestId` — the per-API-call identifier that cross-correlates JSONL with OTEL `claude_code.api_request` events (`DATA-CLAUDE.md` §6 item 10) — is **read but never persisted**. `parseTranscriptFile` ignores it at `155-211`; the type definition (`ClaudeTranscriptLine` at `30-36`) doesn't even declare it.

---

## 9. Claude Code — What we ignore today

The list below cross-references back to `./DATA-CLAUDE.md` (AIX-234). Every row in this table maps a vendor surface that exists on disk (or on a hook / OTEL channel) but is dropped by `claude-reader.ts`.

| Source field / signal | What it would tell us | claude-reader.ts treatment | DATA-CLAUDE.md anchor |
|---|---|---|---|
| `entry.message.content[].type === "tool_use"` (Bash / Edit / Read / Write / MultiEdit / Grep / Glob / Task / Skill / mcp__\*) | Per-tool engineer activity — the single highest-ROI extension cited in TOKENS.md §8 | Skipped — only `usage.*` numbers are aggregated; the `content[]` array is never iterated for assistant turns | `./DATA-CLAUDE.md#22-tool-use-blocks-bash--edit--read--write--grep--glob--task--mcp` |
| `entry.message.content[].type === "thinking"` | Extended-thinking activation per turn (a cost + latency signal independent of `output_tokens`) | Skipped — only contributes opaquely to `output_tokens` | `./DATA-CLAUDE.md#23-thinking-blocks` |
| `entry.message.content[].type === "tool_result"` | Tool success / failure outcomes, file paths affected, duration | Skipped (lives on `user`-type entries via `sourceToolUseID`) | `./DATA-CLAUDE.md#22-tool-use-blocks-bash--edit--read--write--grep--glob--task--mcp` |
| `entry.message.stop_reason` (`end_turn` / `tool_use` / `max_tokens` / `stop_sequence` / `refusal` / `model_context_window_exceeded` / `pause_turn`) | Why each turn ended — `refusal` in particular is a direct risk signal that needs no prompt text inspection | Skipped at the assistant-line branch (`155-203`) | `./DATA-CLAUDE.md#212-per-message-metadata--entrypoint-version-gitbranch-cwd-stop_reason` |
| `entry.cwd` | Per-turn working directory — the only per-message project signal Claude Code emits | Skipped (not declared on `ClaudeTranscriptLine`) | `./DATA-CLAUDE.md#21-chat-turns-user--assistant--system--summary` |
| `entry.gitBranch` | Per-turn git branch — useful for project attribution and for joining to PR / commit events | Skipped (not declared on `ClaudeTranscriptLine`) | `./DATA-CLAUDE.md#212-per-message-metadata--entrypoint-version-gitbranch-cwd-stop_reason` |
| `entry.version` | Claude Code CLI version (e.g. `2.1.142`) — schema-drift attribution | Skipped | `./DATA-CLAUDE.md#212-per-message-metadata--entrypoint-version-gitbranch-cwd-stop_reason` |
| `entry.permissionMode` (`default` / `plan` / `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions`) | Engineer permission posture | Skipped | `./DATA-CLAUDE.md#21-chat-turns-user--assistant--system--summary` |
| `entry.requestId` | Anthropic API request ID — **cross-correlation key between JSONL and OTEL** `claude_code.api_request` events (DATA-CLAUDE.md §6 item 10) | Skipped (not declared) | `./DATA-CLAUDE.md#21-chat-turns-user--assistant--system--summary` |
| `entry.isSidechain` | `true` for subagent turns inlined in the parent transcript | Skipped — and as a side effect, subagent tokens land in their own `SessionAggregate` when stored in `agent-{agentId}.jsonl` side files, with the parent/child relationship lost (`DATA-CLAUDE.md` §6 item 4) | `./DATA-CLAUDE.md#28-sub-agent-dispatch-subagent_type-task-tool` |
| `entry.agentName` / `entry.teamName` | Sub-agent name + agent-team membership | Skipped | `./DATA-CLAUDE.md#28-sub-agent-dispatch-subagent_type-task-tool` |
| `entry.message.usage.cache_creation.ephemeral_5m_input_tokens` | 5m-TTL cache write subtotal (billed at 1.25× base) | Collapsed into `cache_creation_input_tokens` at `174` | `./DATA-CLAUDE.md#24-usage-block-tokens-model-cache-service-tier` |
| `entry.message.usage.cache_creation.ephemeral_1h_input_tokens` | 1h-TTL cache write subtotal (billed at **2× base** — 60% higher than the 5m rate `pricing.ts` assumes) | Collapsed into `cache_creation_input_tokens` at `174` — cost is undercounted on 1h sessions | `./DATA-CLAUDE.md#24-usage-block-tokens-model-cache-service-tier` |
| `entry.message.usage.service_tier` (`standard` / `priority` / `flex`) | Service tier — different pricing tiers and SLAs | Skipped | `./DATA-CLAUDE.md#24-usage-block-tokens-model-cache-service-tier` |
| `entry.message.usage.speed` / `inference_geo` | Latency tier + region | Skipped | `./DATA-CLAUDE.md#24-usage-block-tokens-model-cache-service-tier` |
| `entry.message.usage.iterations[]` | Per-iteration usage array for agent-loop turns — direct measure of autonomy intensity | Skipped | `./DATA-CLAUDE.md#24-usage-block-tokens-model-cache-service-tier` and `./DATA-CLAUDE.md#211-agent-sdk--autonomous-loops` |
| `Task` tool `subagent_type` (e.g. `Explore`) | Sub-agent dispatch — which agent is doing what work | Skipped (tool_use block content is not iterated) | `./DATA-CLAUDE.md#28-sub-agent-dispatch-subagent_type-task-tool` |
| `Skill` tool `skill_name` | Which skill was invoked (e.g. `swagger-sync`, `actionpolicy-check`) | Skipped | `./DATA-CLAUDE.md#27-slash-commands--skills` |
| `Bash` tool `tool_input.command` (`git commit`, `git push`, test runners) | Commit detection, test-run detection, push detection | Skipped | `./DATA-CLAUDE.md#22-tool-use-blocks-bash--edit--read--write--grep--glob--task--mcp` |
| `Edit` / `Write` / `MultiEdit` / `NotebookEdit` tool_use blocks | File modification events, with `file_path` granularity | Skipped | `./DATA-CLAUDE.md#210-file-edits--writes-with-diff-size-as-a-metric` |
| MCP tool calls — `mcp__<server>__<tool>` content blocks | MCP server invocation telemetry | Skipped | `./DATA-CLAUDE.md#22-tool-use-blocks-bash--edit--read--write--grep--glob--task--mcp` |
| Hook system — 28 documented event names (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`/`SubagentStop`, `TaskCreated`/`TaskCompleted`, `PreCompact`/`PostCompact`, `Notification`, etc.) | A **complete alternate ingestion channel** — every tool call could be captured by `PostToolUse` posting to `/api/v1/telemetry/claude-hook` without JSONL parsing | Not consumed by `claude-reader.ts` at all (a hook endpoint exists in `telemetry_controller.rb:147` but emits an enum value PG rejects — see §3a / §15 row "Hook ingestion path") | `./DATA-CLAUDE.md#26-hooks--the-full-surface` |
| OpenTelemetry export (`CLAUDE_CODE_ENABLE_TELEMETRY=1`) — 8 metrics + 16+ event types | Strictly more data than JSONL: `claude_code.tool_decision.source`, `claude_code.code_edit_tool.decision.language`, `claude_code.tool.blocked_on_user.duration_ms`, `claude_code.cost.usage` already in USD, `claude_code.api_request.request_id` for cross-correlation | Not consumed — JSONL is the only ingestion path today | `./DATA-CLAUDE.md#213-opentelemetry-export--a-complete-alternate-ingestion-channel` |
| Distributed tracing (beta) — `claude_code.tool.blocked_on_user.duration_ms` | Permission-prompt wait time, a leading indicator of permission fatigue (engineers letting prompts hang) | Not consumed (OTEL-only signal) | `./DATA-CLAUDE.md#213-opentelemetry-export--a-complete-alternate-ingestion-channel` |
| `summary` lines (`type: "summary"`, `subtype: compact_boundary`) | Session-compaction boundaries — useful for detecting "context window exhausted" sessions | Skipped — only `type === "assistant"` and `type === "user"` are handled (`155, 204`); other types `continue` at `209-210` | `./DATA-CLAUDE.md#25-session-lifecycle-start--compact--resume--end` |
| `entry.message.id` (e.g. `msg_01XYZ`) | Per-message Anthropic API id — supplementary cross-correlation when `requestId` is unavailable | Skipped | `./DATA-CLAUDE.md#21-chat-turns-user--assistant--system--summary` |
| User-turn text (full prompt content) | **Deliberately out of scope** for this epic per TOKENS.md §7 — risk-scanned in-memory, dropped before egress | Held transiently at `204-208`, **never persisted**, derived signal only (`risk_level/score/categories`) | `./DATA-CLAUDE.md#21-chat-turns-user--assistant--system--summary` |

---

## 10. Claude Code — Vocabulary gaps · Rails enums

### 10a. Pre-condition — close the live enum divergence first (§3a)

The same three-way Postgres / Ruby / controller divergence documented in §3a applies here, and **claude is what makes it urgent**: the highest-ROI claude extension is per-tool emission (TOKENS.md §8 #2 — see §13 `claude-1`), and the natural enum value for those events is `tool_use` — exactly the value `telemetry_controller.rb:147` already emits and that Postgres rejects today. Until `cursor-3` (PG↔Ruby enum-invariant CI check + fix) lands, **none of the proposals below can ship**. The claude-side work is gated on the cursor section's `cursor-3`; we do not duplicate the sub-task here, we just record the hard dependency.

### 10b. Proposed `event_type` additions (claude-driven)

All require migration **and** Ruby constant update **and** swagger update, in addition to the §3a invariant landing first. Each value below is a concrete signal already detectable in the JSONL at `entry.message.content[]` or on a hook payload.

| Proposed enum value | When emitted | Source on disk | Notes |
|---|---|---|---|
| `tool_use` | Generic tool invocation (catch-all when a more specific value below doesn't apply) | `content[].type === "tool_use"` | Already in `ToolEvent::EVENT_TYPES` (Ruby) but missing from PG. Land the PG migration in `cursor-3` so this value becomes usable. |
| `edit` | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` tool calls | `content[].name ∈ {Edit, Write, MultiEdit, NotebookEdit}` | `edit` is already in PG + Ruby. The work is purely CLI-side extraction. |
| `commit` | `Bash` tool call where `tool_input.command` starts with `git commit` (also `git rebase --continue`, `git cherry-pick --continue`) | `content[].name === "Bash" && /^git commit/.test(input.command)` | `commit` is already in PG + Ruby (used by cursor `cursor-1`); shared between tools. |
| `test` | `Bash` tool call running a test command (`rspec`, `vitest`, `npm test`, `pytest`); or `Edit/Write` against `*.spec.*` / `*.test.*` files | `content[].name === "Bash"` with command regex OR `Edit` with `file_path` matching test glob | `test` is already in PG + Ruby. |
| `subagent_run` | `Task` tool dispatch — one event per `subagent_type` invocation | `content[].name === "Task" && content[].input.subagent_type` | New value. Lets dashboards slice by sub-agent (Explore vs reviewer vs custom). |
| `skill_run` | `Skill` tool invocation, plus slash-command expansions | `content[].name === "Skill" && content[].input.skill_name` | New value. Plus `UserPromptExpansion` hook payload (when the alternate hook channel lands). |
| `hook_event` | Future: emitted by `PostToolUse` / `PostToolUseFailure` / `Stop` hook posting to the telemetry endpoint | Hook stdin → server controller | Exploratory. Lets us collect tool decisions, refusals, permission-wait latency that JSONL doesn't carry. |
| `mcp_tool_call` | Any `content[].name` starting with `mcp__` | `content[].name.startsWith("mcp__")` | Parallels the cursor `mcp_tool_call` proposal in §3b. Same enum value for both tools = consistent dashboard story. |
| `extended_thinking` | A turn with one or more `content[].type === "thinking"` blocks | `content[].type === "thinking"` | Optional. Could also be encoded as a boolean `metadata.extended_thinking` rather than its own event_type — see §10c. |

### 10c. Proposed standardized `metadata.*` keys (claude-side)

These are all derivable from `DATA-CLAUDE.md` §2.1, §2.4, §2.6, §2.8, §2.12, but none are persisted today.

| Key | Type | Source | Status today | Proposal |
|---|---|---|---|---|
| `entrypoint` | string (`cli` / `sdk` / `ide` / `claude_p`) | Derived from OTEL `start_type` + `terminal.type`; or, from `query_source` on the API request | Not extracted | Add at the same time as OTEL ingest, or as a CLI heuristic from `process.env.CLAUDECODE` / `process.title` |
| `git_branch` | string | `entry.gitBranch` on the latest assistant turn of the session | Not extracted | Add to `SessionAggregate`, propagate to payload |
| `cwd` | string | `entry.cwd` on the latest assistant turn | Not extracted | Use for project attribution (already what `resolveProjectId` would consume if it had the input) |
| `iterations` | integer | `entry.message.usage.iterations.length` summed over the session | Not extracted | Lets us measure autonomy intensity per session |
| `stop_reason_summary` | object — `{end_turn: 12, tool_use: 5, refusal: 0, max_tokens: 1}` | `entry.message.stop_reason` per assistant turn | Not extracted | Aggregate counts per session. Especially valuable: `refusal > 0` and `max_tokens > 0` as health signals (no text required). |
| `service_tier` | string (`standard` / `priority` / `flex`) | `entry.message.usage.service_tier`, last-seen wins | Not extracted | Pricing tier slicing |
| `claude_code_version` | string (semver) | `entry.version`, last-seen wins | Not extracted | Schema-drift attribution; equivalent of `cursor_version` proposed in §3c |
| `subagent_type` | string | `content[].input.subagent_type` for `Task` tool blocks | Not extracted | Required when emitting `subagent_run` events |
| `skill_name` | string | `content[].input.skill_name` for `Skill` tool blocks | Not extracted | Required when emitting `skill_run` events |
| `tool_name_inner` | string (`Bash` / `Edit` / `Write` / `Read` / `Grep` / `Glob` / `Task` / `Skill` / `mcp__server__tool`) | `content[].name` on each tool_use block | Not extracted | The per-tool slicing key — needed even when the outer `event_type` is the more specific `edit` / `commit` / `test` |
| `cache_ttl_split` | object — `{ephemeral_5m: <int>, ephemeral_1h: <int>}` | `entry.message.usage.cache_creation.ephemeral_5m_input_tokens` + `ephemeral_1h_input_tokens` | Not extracted (collapsed at `claude-reader.ts:174`) | Lets `pricing.ts` bill the 1h bucket at 2× base instead of 1.25× — closes the cost-undercounting bug |
| `request_id` | string | `entry.requestId` on the last assistant turn | Not extracted | Cross-correlation key with OTEL `claude_code.api_request.request_id`; cheap to capture, enables future OTEL join |
| `cost_source` | string (`client` / `server_estimated`) | Already stamped by `upsert.rb:69-73` | **Already emitted** by the server | Document and pin shape (same as cursor `cost_model` story) |

Swagger update (`packages/api/swagger/v1/swagger.yaml`, Ingest section, ~lines 1380–1480) is part of every metadata-key addition.

---

## 11. Claude Code — Vocabulary gaps · Web (TypeScript)

§4 above already documents the live four-way divergence (`types.ts:214-222` ≠ `EventFilters.tsx:50-55` ≠ Ruby ≠ Postgres). The claude proposals piggy-back on the same files. Concrete claude-flavored additions:

- `packages/web/src/lib/types.ts:214-222` — extend the `EventType` union with `tool_use`, `subagent_run`, `skill_run`, `hook_event`, `mcp_tool_call`, `extended_thinking` (in addition to the cursor-side values listed in §4). After both passes, the union becomes the canonical client-side enum and `EventFilters.tsx` should import from it.
- `packages/web/src/lib/types.ts` — extend the `ToolEventMetadata` interface (or introduce one if it doesn't yet exist) with the typed sub-shape for claude metadata keys: `entrypoint?: "cli" | "sdk" | "ide" | "claude_p"`, `git_branch?: string`, `iterations?: number`, `stop_reason_summary?: Record<StopReason, number>`, `service_tier?: "standard" | "priority" | "flex"`, `claude_code_version?: string`, `subagent_type?: string`, `skill_name?: string`, `tool_name_inner?: string`, `cache_ttl_split?: { ephemeral_5m: number; ephemeral_1h: number }`, `request_id?: string`, `cost_source?: "client" | "server_estimated"`. This unblocks typed access in dashboard tiles instead of `unknown` casts.
- `packages/web/src/components/events/EventFilters.tsx:50-55` — same recommendation as §4: drop the hardcoded list and either import from `types.ts` or fetch from `GET /events/summary` (the AIX-115 pattern landed at commit `0ceaa46`). Once claude-side `event_type` granularity ships, the filter automatically picks up `subagent_run` / `skill_run` / `mcp_tool_call` without further front-end work.
- `packages/web/src/lib/eventsToolFilters.ts:12-18` — no changes for the claude triage itself (`claude_code` is already present at line 14), but flag for follow-up: `claude_code` tool filter could be extended with a "sub-agent" sub-facet sourced from `metadata.subagent_type` when present.
- Dashboard surfaces — once `subagent_run` / `skill_run` / per-tool granularity lands, the org dashboard (`packages/web/src/pages/OrgDashboard.tsx`) and the events page deserve dedicated tiles: a "Tool-use breakdown" pie (`tool_name_inner` distribution) and a "Refusal rate" alert. None of these require schema additions beyond §10c.

---

## 12. Claude Code — Sanitization considerations

Two structural facts shape this section:

1. **Claude events carry `scannable: true`** (`claude-reader.ts:254`), which causes `ClassificationActivity` to take **Path 2** (`classification_activity.rb:30-44`) — the server trusts the CLI's pre-scan and hardcodes `requires_sanitization: false`. As a consequence, `SanitizationActivity` (`sanitization_activity.rb:16`) returns the payload unchanged. **The CLI's risk-scanner is the single point of trust for claude content classification.**
2. **No prompt or response text is on the wire today.** `parseTranscriptFile` holds user-turn text in memory (`claude-reader.ts:204-208, 215-222`) only long enough to compute risk signals, then drops it. The on-disk JSONL contains full prompts and responses; the network payload never does.

Every claude proposal in §10/§13 must honour both rules. The table below evaluates each new field for sanitization implications, including the Bash-command-arg special case the task contract calls out.

| Proposed field (§10c / §13) | Text-bearing? | Server-side sanitization gap? | Notes |
|---|---|---|---|
| `metadata.subagent_type` (e.g. `Explore`, `reviewer`) | Enum-like | No | Bounded set of agent type names. Add to allow-list (see `cursor-8`-style server policy). |
| `metadata.skill_name` (e.g. `swagger-sync`) | Enum-like | No | Plug-in / user skills are unbounded, but values are file-system-derived (skill folder name), not user prompts. |
| `metadata.tool_name_inner` (`Bash`, `Edit`, …) | Enum-like | No | Bounded set; `mcp__<server>__<tool>` is the longest-tail case. |
| `metadata.git_branch` | Yes (low-risk) | Yes | Same as cursor (§5). Mostly safe; flag advisory. |
| `metadata.cwd` | Yes — may include usernames / customer codenames in path | Partial | The `~/dev/<customer>/<project>` pattern reveals customer identifiers. **Recommend the same `internal_hostname` + `customer_identifier` patterns proposed in `cursor-7`** also redact tokens out of `cwd` values. |
| `metadata.request_id` (`req_011AbcDef`) | No (opaque token) | No | Pure identifier. |
| `metadata.stop_reason_summary` | No (numeric counts) | No | Aggregate. |
| `metadata.iterations` | No (integer) | No | |
| `metadata.cache_ttl_split` | No (integers) | No | |
| `metadata.service_tier` / `claude_code_version` | Enum-like | No | |
| `metadata.entrypoint` | Enum-like | No | |
| **Per-tool extracted events — `Bash` `tool_input.command` strings** | **Yes — high-risk** | **Yes — major gap** | A Bash command like `aws s3 sync s3://internal-bucket/ . --profile customer-prod` is a single string carrying credentials profile names, S3 bucket names, internal hostnames, sometimes inline tokens (`curl -H "Authorization: Bearer ..."`). If we ever persist the command (even hashed), it must go through a sanitizer **on the CLI** before egress. The server-side Path 2 trust assumption (`classification_activity.rb:30-44`) means the server will not re-scan. Captured as `claude-7` below. |
| **Per-tool extracted events — `Edit`/`Write` `tool_input.old_string`/`new_string`/`content`** | **Yes — high-risk** | **Yes — major gap** | File contents. Out of scope for this epic per TOKENS.md §7, but if any per-edit metadata captures even snippets, the same CLI-side sanitization rule applies. The current proposal is to capture `file_path` only (which is `git_branch`-class low-risk); old/new content is **not** proposed. |
| **`Skill`/`Task` `tool_input.prompt`** | Yes — high-risk | Yes | Free-text prompts to sub-agents. **Not proposed for capture** — keep `subagent_type` / `skill_name` only. Explicitly noted here so a future PR doesn't accidentally widen scope. |

**Recommended new policy rules — claude-specific** (captured as sub-task `claude-7`):

1. **Bash-command-arg scrubbing** — CLI-side regex pass over `tool_input.command` before any field derived from it (e.g. `metadata.bash_intent: "commit" | "test" | "push"`) is emitted. Patterns: AWS / GCP / Azure CLI profile flags, `--password=`, `--token=`, `Authorization:` header substrings, `curl ... | sh` patterns, env-var leakage (`AWS_SECRET_ACCESS_KEY=...`).
2. **`stop_reason: refusal` as a structured risk signal** — emit `metadata.refusal_count` and surface refusals in the alert pipeline. Counting refusals is not a data-leak surface (it's just a count), but elevating refusals as a first-class risk category lets the platform act on safety friction.
3. **CLI-side allow-list for `tool_input.<key>` derivations** — any new field that *summarizes* a tool_use block must declare which input keys it consumes. Default-deny: if a field would consume `command`, `prompt`, `content`, `old_string`, or `new_string`, the field must go through the CLI scrubber from rule 1.
4. **Trust boundary documented** — add a doc comment to `claude-reader.ts:254` explaining the `scannable: true` semantics (server skips sanitization) so future authors don't accidentally land a server-side sanitization rule and assume it covers claude events. The fact that this is invisible from the server side is itself a hazard.

**Out-of-scope reminder:** prompt text capture (full transcript egress) remains off-limits per TOKENS.md §7. Everything in §12 above is about metadata derivations and per-tool event extractions, never raw user content.

---

## 13. Claude Code — Proposed sub-tasks

Each item is sized to one PR. Tags: `[Schema]` `[Extractor]` `[Sanitization]` `[Front-end]`. Order is roughly dependency-ordered, but `claude-1` and `cursor-3` (the enum-invariant CI check from §3a) are hard prerequisites for the schema work.

| ID | Tag | Title | Concrete change | Files touched |
|---|---|---|---|---|
| `claude-1` | Schema | Extend PG `event_type` enum + Ruby constant + Swagger with claude-driven values | Migration adds `subagent_run`, `skill_run`, `hook_event`, `mcp_tool_call`, `extended_thinking`. Ensure `tool_use` is added to PG (currently Ruby-only — §3a). Ensure `edit` / `commit` / `test` are already present (they are). Update `EVENT_TYPES` constant and `swagger.yaml` in the same commit. **Gated on `cursor-3` landing first** so the PG↔Ruby invariant is enforced. | `packages/api/db/migrate/<new>.rb`, `packages/api/app/models/tool_event.rb:12-13`, `packages/api/swagger/v1/swagger.yaml` (Ingest section) |
| `claude-2` | Extractor | Extract `tool_use` blocks into per-tool child events — single highest-ROI claude change | Iterate `entry.message.content[]` on every assistant turn (currently the array is ignored). For each `tool_use` block, emit a child event with: outer `event_type` mapped via the table in §10b (Edit/Write/MultiEdit/NotebookEdit → `edit`; `Bash + /^git commit/` → `commit`; test runners → `test`; `Task` → `subagent_run`; `Skill` → `skill_run`; `mcp__*` → `mcp_tool_call`; else → `tool_use`), `metadata.tool_name_inner` = `content[].name`, and per-tool input keys per §10c. Tokens still aggregate at the session level. **TOKENS.md §8 #2.** | `packages/tools/db90-claude/src/claude-reader.ts:120-267`, `packages/tools/db90-claude/src/sync.ts:28-130` |
| `claude-3` | Extractor | Surface per-session metadata: `entrypoint`, `git_branch`, `cwd`, `iterations`, `stop_reason_summary`, `service_tier`, `claude_code_version`, `request_id`, `cache_ttl_split` | Extend `SessionAggregate` to carry the new fields. Populate `cache_ttl_split` by reading `usage.cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` from `usage` (currently only the rollup is read at `174`). **TOKENS.md §8 #3.** | `packages/tools/db90-claude/src/claude-reader.ts:38-53, 155-225, 244-256`, `packages/tools/db90-claude/src/pricing.ts:33-171` (to consume `cache_ttl_split` at the 2× rate for 1h tokens) |
| `claude-4` | Extractor | Sub-agent + skill tagging | When `claude-2` emits a `subagent_run` event, populate `metadata.subagent_type` from `content[].input.subagent_type`; when it emits a `skill_run` event, populate `metadata.skill_name`. Also reconcile sibling `agent-{agentId}.jsonl` files: when `findTranscriptFiles` returns both a parent and a child transcript, link them via a derived `metadata.parent_session_id` rather than treating each as an unrelated `SessionAggregate` (currently both flow through the file walk independently — `DATA-CLAUDE.md` §6 item 4). **TOKENS.md §8 #4.** | `packages/tools/db90-claude/src/claude-reader.ts:96-225` |
| `claude-5` | Extractor | Recover cost-decomposition accuracy on 1h-TTL cache writes | Consume `cache_ttl_split` (from `claude-3`) in `pricing.ts:calculateCost`: split `cacheWriteTokens` into 5m (1.25× base) and 1h (2× base) buckets and price each separately. Bump the `Rates last verified` comment header. Add a unit test with a session that has 50% 5m + 50% 1h cache_creation. | `packages/tools/db90-claude/src/pricing.ts:33-171`, `packages/tools/db90-claude/test/pricing.test.ts` (new or extended) |
| `claude-6` | Extractor | Hook-driven event emission (exploratory) | Document the alternate ingestion path. **Do not adopt yet** — file an exploration spike for: (a) point `.claude/settings.json` `hooks.PostToolUse` at a small forwarder script that POSTs to `/api/v1/telemetry/claude-hook`; (b) confirm `telemetry_controller.rb:147` correctly maps `params[:hook_event]` to an `event_type` value PG accepts (this is blocked by `claude-1` / `cursor-3`); (c) compare per-event vs per-session granularity for cost / latency / accuracy. Note in this task: hook-driven emission would obsolete JSONL parsing for everything except cost decomposition. | `docs/data-pipeline/HOOK-INGESTION-SPIKE.md` _(new)_ |
| `claude-7` | Sanitization | Bash-command-arg scrubber + `refusal` signalling | Per §12 rule 1: add a CLI-side scrubber that runs over any field derived from `tool_input.command` before it leaves the host. Patterns: cloud-CLI profile flags, `Authorization:` headers, `--token=`, `--password=`, env-var leakage. Per §12 rule 2: emit `metadata.refusal_count` aggregated from `stop_reason: refusal` across the session, and tag the event with `metadata.risk_categories += ["refusal"]` when non-zero. | `packages/tools/db90-claude/src/risk-scanner.ts`, `packages/tools/db90-claude/src/claude-reader.ts:204-225` |
| `claude-8` | Sanitization | Document the Path-2 trust boundary | Add a header comment to `claude-reader.ts:244-256` (the `metadata.scannable = true` line) cross-referencing `classification_activity.rb:30-44` so future authors understand the server skips sanitization for claude events. Add a CI lint rule: any change that adds a new metadata key to the claude payload must also touch `risk-scanner.ts` *or* explicitly opt out with a documented allow-list entry. | `packages/tools/db90-claude/src/claude-reader.ts`, `packages/api/.rubocop.yml` or `.github/workflows/ci.yml` |
| `claude-9` | Sanitization | Server-side metadata allow-list (claude side, mirroring `cursor-8`) | Tighten `IngestController#permitted_params` so claude `metadata` accepts only the documented standardized keys from §8 + §10c. Unknown keys are dropped at `:info`. Stops payload-shape drift on the CLI side from bypassing the documented schema. | `packages/api/app/controllers/api/v1/ingest_controller.rb:127-133`, `packages/api/swagger/v1/swagger.yaml` |
| `claude-10` | Front-end | Typed `ToolEventMetadata.claude` discriminated union | Per §11: extend the `ToolEvent`/`ToolEventMetadata` types so consumers can read `metadata.subagent_type` / `metadata.tool_name_inner` without `unknown` casting. Discriminate by `tool_name === "claude_code"`. | `packages/web/src/lib/types.ts:224-250` |
| `claude-11` | Front-end | Per-tool breakdown tile (Tool-use granularity) | When the org has any events with `metadata.tool_name_inner` set, render a tile on `OrgDashboard.tsx` showing distribution of `Bash` / `Edit` / `Read` / `Grep` / `Task` / `Skill` / `mcp__*`. Same component pattern as `WeeklyToolUsageChart` (PR #151, `0ceaa46`). | `packages/web/src/pages/OrgDashboard.tsx`, new `packages/web/src/components/dashboard/ClaudeToolBreakdownTile.tsx` |

**Group coverage:** Schema (1) · Extractor (5) · Sanitization (3) · Front-end (2) — all four groups, eleven total. Exceeds the ≥ 6 / ≥ 3-of-4 bar.

---

## 14. Claude Code — Risk & rollout

| Concern | Detail | Mitigation |
|---|---|---|
| Per-session aggregation vs per-message granularity trade-off | `claude-reader.ts` aggregates the entire JSONL into one `SessionAggregate` per `sessionId`. When `claude-2` extracts per-tool child events, the natural granularity shifts: do we emit N child events *plus* the parent session, or N child events *replacing* the parent? Both have failure modes — duplicating tokens (former) or losing the session-level cost roll-up (latter). | Proposed: child events with `metadata.parent_event_session_id` and *zero* token counts on the children; the parent event keeps the aggregate token totals. Children act as "facets" of the parent, queryable without double-counting. Document explicitly in `claude-2`'s PR description. |
| `ToolEvents::Upsert` dedup interaction | The session-id dedup (`upsert.rb:32-34, 77-83`) keys on `metadata.session_id`. Per-tool child events sharing the same `session_id` will collide on the advisory lock and overwrite each other unless we extend the dedup key. | `claude-2` must extend `Upsert` (or introduce `ToolEvents::UpsertChild`) so child events dedup on `(session_id, content_block_uuid)` — using the JSONL `tool_use_id` (`toolu_<hex>`) as the per-block identifier. The `tool_use_id` is stable across re-sends because the JSONL is append-only. |
| Cache-token cost decomposition implications (1h TTL bug) | The current `pricing.ts` collapses 5m + 1h cache_creation into one bucket at 1.25× base. Real Anthropic billing applies 2× base to the 1h portion. On sessions with 1h cache writes (currently rare — `cache_control.ttl: 1h` requires model-side opt-in), cost is undercounted by up to 60% on the 1h slice. The bug is silent — neither the CLI nor the server reports a discrepancy because the server uses the same `pricing.ts` math when `cost_usd` is null. | `claude-5` ships the fix together with `claude-3` (which surfaces `cache_ttl_split`). Coordinate with the `check-claude-pricing.yml` workflow (`pricing.ts:7-9`) to also alert when the 1h multiplier changes. |
| `last-seen model wins` semantic + mid-session model switches | A session where the engineer switches Opus → Sonnet (or vice versa) mid-session ends with `agg.model` equal to whichever model was last seen. All session tokens are then billed at that model's rate — inflating or deflating the session's recorded cost vs the real mix. | A follow-up to `claude-5` should switch `calculateCost` to a weighted-by-turn computation when `cache_ttl_split` is augmented with per-model token counts. Stage this gracefully — out of scope for §13's eleven items. |
| Sub-agent transcript files (`agent-{agentId}.jsonl`) | `findTranscriptFiles` walks `**/*.jsonl` (`claude-reader.ts:102`) and emits one `SessionAggregate` per file. A subagent's transcript is collected as if it were a standalone session, losing the parent-child link. Cost dashboards then count the subagent's tokens twice (once on the parent via `Task` tool, once on the child as its own session) when both files are present. | `claude-4` reconciles parent + child via `metadata.parent_session_id`. Until that ships, document the double-count as a known issue. The `isSidechain` flag (when subagent turns are inlined into the parent transcript instead of split into a sibling file) is the alternative reconciliation source and should be checked first. |
| `scannable: true` Path-2 trust boundary | Because the server takes Path 2 in `ClassificationActivity` for any payload with `scannable: true` + `metadata.risk_level`, every new claude metadata key bypasses server-side sanitization. A CLI bug that leaks credentials into `metadata.cwd` or `metadata.bash_intent` would land in `tool_events` unredacted. | `claude-7` (Bash-arg scrubber) and `claude-8` (documented trust boundary + CI lint) form the joint mitigation. Long-term option: add a server-side "thin scan" pass over claude metadata values for the universal patterns (`api_key`, `aws_secret`, `private_key`) even when `requires_sanitization` is `false`, treating them as a belt-and-suspenders check. This would not require revisiting the Path-2 design. |
| JSONL file growth + re-send semantics | A long-running session's JSONL grows monotonically. Each `db90-claude sync` re-reads the file from the top, recomputes the `SessionAggregate`, and re-POSTs. `ToolEvents::Upsert` updates the existing row instead of inserting (`upsert.rb:4-7`). This works today; it does **not** work cleanly for `claude-2`'s child events unless `Upsert` extends as described in row 2. Also, line-level streaming via `createReadStream` (`claude-reader.ts:134-137`) handles large files in constant memory, but the per-session map (`sessions`) grows linearly with concurrent sessions. | No immediate mitigation needed; the file-by-file parallel `Promise.all` in `sync.ts:50` keeps wall time bounded. Flag for `claude-2`: child-event dedup is a strict prerequisite. |
| Hook-driven emission stalling on the live enum bug | `telemetry_controller.rb:147` emits `event_type: "tool_use"` on `PostToolUse` hook events. Postgres rejects it as enum-out-of-range. Any team that wires up a `PostToolUse` hook today will get 500s. | `cursor-3` lands the enum-invariant fix (§3a). `claude-1` adds `tool_use` to PG. `claude-6` then opens the door for the spike. Order matters: do not advertise the hook path until both ship. |
| Retention windows for `tool_use` / `subagent_run` / `skill_run` events | Same as cursor §7: new event types inherit the org's default retention window. `tool_use` / `Read` / `Grep` / `Glob` events will be **very high volume** (orders of magnitude more than `chat` aggregates). At 30-day default retention, the hypertable may grow much faster than today. | Propose: per-event-type retention as a follow-up. For now, `claude-2` should sample / aggregate read-only tool calls (`Read` / `Grep` / `Glob`) into one daily count instead of per-call. Document in the `claude-2` PR. |
| TimescaleDB compression after 7 days | Same as cursor §7: rows older than 7 days are compressed; column-level alters become expensive. All claude additions in §10c land in `metadata` (JSONB), not new top-level columns. | Stay in `metadata`. No new columns proposed in §13. |

---

## 15. Cross-tool summary

Closes the loop between cursor (§1–§7) and claude (§8–§14). One row per dimension; every cell filled. "Gap action" links back to the sub-task(s) that would close the gap; "none — already covered on both sides" is acceptable and used where appropriate.

| Dimension | Cursor today | Claude Code today | Gap action |
|---|---|---|---|
| `event_type` coverage | `chat`, `completion`, `commit` (3/14) | `chat` only (1/14) — every tool_use, edit, commit, test, subagent, skill, MCP call is collapsed (§8a, `claude-reader.ts:241`) | `claude-2` (extract `tool_use` blocks into per-tool child events) jumps claude coverage to ~6/14 without schema changes beyond `claude-1`. Cursor's `cursor-5` (composer parser) gets cursor to ~6/14. Net: both tools to 6/14 after the §3a invariant lands (`cursor-3`). |
| Commit detection | `recentCommit` → `event_type: commit` (§1b, AIX-235) | Captured as JSONL `Bash(git commit ...)` tool_use blocks but **not extracted** (§9 row `Bash tool_input.command`) | Cursor side done. `claude-2` extracts `Bash` blocks with `git commit` into `commit` events for a consistent dashboard story. |
| Tool-use granularity | None — single daily aggregate per (tool, model, event_type) (§1a) | None — single per-session aggregate per (tool, model) (§8a). `content[].name` is never iterated. | `cursor-5` (composer / inline-edit / mcp parsing) on the cursor side; `claude-2` + `claude-4` on the claude side. Adopt `metadata.tool_name_inner` as the shared key (`Bash`, `Edit`, `Read`, etc., or `composer_chat`/`inline_edit` for cursor) so the front-end tile (`claude-11`) works for both. |
| Sub-agent / skill markers | n/a today — Cursor's "agent mode" is the closest analogue (§3b row `composer_agent`); not parsed | n/a today — `subagent_type` and `skill_name` are present in the JSONL (`Task` / `Skill` tool blocks) but skipped (§9). | Sub-task pair `cursor-5` + `claude-4`. Shared metadata keys `metadata.subagent_type` / `metadata.skill_name`. Front-end tile: `claude-11` covers both. |
| Cache token capture | n/a — Cursor cost is line-based; cache concept does not apply | Captured at the rollup level (`metadata.cache_write_tokens` / `cache_read_tokens`, §8a). 5m vs 1h TTL split is **collapsed** at `claude-reader.ts:174`, undercounting cost on 1h sessions. | None on cursor side. On claude side: `claude-3` surfaces `metadata.cache_ttl_split`; `claude-5` consumes it in `pricing.ts` so the 1h portion is billed at 2× base. Net: claude cost accuracy improves; cursor unchanged. |
| Service tier / region | Not exposed by Cursor's daily-stats schema | Available in `entry.message.usage.service_tier`/`speed`/`inference_geo` but skipped (§9) | `claude-3` adds `metadata.service_tier`; `claude_code_version` etc. Cursor side: no signal, no action. |
| Model attribution | `unknown` on aggregates (Paths A/B), real on Path C (legacy rows) (§1a, §1c) | Real on every event but **last-seen wins** within a session (`claude-reader.ts:199-200`), so mid-session model switches rebill the entire session at the last-seen model's rate (§8b, §14 row 4) | Cursor: no near-term fix without composer parsing (`cursor-5`). Claude: a weighted-by-turn cost computation is a follow-up to `claude-5`. |
| Session dedup | Only Path C populates `cursor_session_id`; Paths A/B use `null` and skip the `metadata.session_id` dedup path | Always populated from JSONL `sessionId`; every event goes through `ToolEvents::Upsert#upsert_with_lock` (`upsert.rb:77-83`) | Cursor: `cursor-5` makes composer events emit `metadata.session_id = composer_uuid` so they get the same dedup treatment. Claude: extend dedup key for child events to `(session_id, tool_use_id)` per `claude-2` and §14 row 2. |
| Sanitization scope | Metadata-only (no prompt text). `metadata.scannable: false` forces Path 1 in `ClassificationActivity` (`classification_activity.rb:17-25`) — no scan, `risk_level: none`. | CLI pre-scans user text in-memory, ships derived `risk_level/score/categories` with `metadata.scannable: true`. Server takes **Path 2** (`classification_activity.rb:30-44`) — trusts the CLI verbatim, `requires_sanitization: false`. | Cursor: `cursor-7` extends server policy with internal-hostname + customer-identifier patterns (applies to commit_message and similar low-risk text). Claude: `claude-7` adds a CLI-side Bash-arg scrubber; `claude-8` documents the Path-2 trust boundary; `claude-9` adds server-side metadata allow-list. **Cursor and claude trust models stay different** — cursor server scans, claude server trusts the CLI — and both directions need to remain robust. |
| Prompt-text policy | Out of scope this epic — Cursor stores prompt text in `cursorDiskKV` blobs but DB90 never reads it (§7) | Out of scope this epic — Claude Code writes full prompts + responses to JSONL; `claude-reader.ts:204-208` reads user text only transiently in-memory and never persists it (§8b). The OTEL alternate channel (`OTEL_LOG_RAW_API_BODIES`, `DATA-CLAUDE.md` §6 item 2) is the documented opt-in capture path — also out of scope. | none — already covered on both sides. Both tools maintain a "no prompt text leaves the host" posture by construction. Document the Path-2 trust boundary (`claude-8`) so this invariant stays explicit going forward. |
| Version pinning | `v1.5` hardcoded at `cursor-reader.ts:170` (§7) — silent zero-event regression on Cursor schema bumps | Not pinned — `claude-reader.ts` reads `entry.message.usage.*` by name only; new optional fields land harmlessly. The CLI also has no version sentinel of its own. | Cursor: `cursor-6` (version discovery + structured log on new versions). Claude: `claude-3` (`metadata.claude_code_version` from `entry.version`) gives schema-drift attribution. Different shapes of the same risk, addressed independently. |
| Local-store schema risk | High — `cursorDiskKV` blobs are undocumented and per-version (§3b, §6 `cursor-6`) | Lower — `~/.claude/projects/<dir>/<session>.jsonl` is documented (`DATA-CLAUDE.md` §2.1) and Anthropic-stable. Sub-agent transcript location *has* moved between versions (`agent-{agentId}.jsonl` vs inline `isSidechain`, `DATA-CLAUDE.md` §6 item 4). | Cursor: `cursor-5` builds the composer parser with explicit version handling. Claude: `claude-4` reconciles parent + child transcripts and prefers the `isSidechain` path when present. The structural risk is much lower on claude — JSONL changes are additive — but `claude_code_version` (`claude-3`) gives us an early-warning signal regardless. |
| Background-agent / autonomous runs | Not captured — Cursor background-agent runs live in Cursor cloud, no local store (§2) | Partially observable — Agent SDK invocations and `Task` tool dispatches land in the same JSONL or `agent-{agentId}.jsonl` (`DATA-CLAUDE.md` §2.8, §2.11). OTEL `query_source` distinguishes `main` / `subagent` / `auxiliary` but is not consumed. | Cursor: lowest priority sub-task `cursor-2` row 7 (`background_agent_run`), gated on Cursor exposing local data. Claude: `claude-4` (parent / subagent reconciliation) plus the future OTEL spike (`claude-6`) where `query_source` becomes available. |
| Cost model | `cost_model: "estimated_line_count"` on every cursor event (§1a-c). Misleading on Path C (real tokens, not lines). Cleanup in `cursor-1`/`cursor-2`/`cursor-3`. | `metadata.cost_source` stamped server-side by `Upsert#enrich_cost!` (`upsert.rb:69-73`) — `"client"` when client cost is non-null, `"server_estimated"` when server fills it from `ModelPricingService`. The CLI side does not stamp a parallel `cost_model` value. | Document `cost_source` shape in `claude-9` (server allow-list). On cursor side, deprecate `cost_model: "estimated_line_count"` on Path C in favour of `cost_model: "real_tokens"` (captured as cursor-side follow-up; not in §6 today). Long-run: one canonical `cost_source` / `cost_model` pair on every tool's events. |
| Hook ingestion path | n/a — Cursor has no hook system | Available — 28 documented hook events (`DATA-CLAUDE.md` §2.6). A `claude-hook` endpoint exists at `telemetry_controller.rb:147` but emits `event_type: "tool_use"` which **Postgres rejects** today (§3a live bug). | **Joint dependency: `cursor-3` (enum-invariant CI check + fix) must land before any hook ingestion can succeed.** Then `claude-6` opens the spike. The hook path is documented as the cleanest long-term route to per-tool granularity but not adopted now. |

---

_Generated for AIX-235 (cursor section + scaffold) and AIX-236 (claude section + cross-tool summary). Companion document: `./TOKENS.md`. Cross-references: `./DATA-CURSOR.md` (AIX-233), `./DATA-CLAUDE.md` (AIX-234)._
