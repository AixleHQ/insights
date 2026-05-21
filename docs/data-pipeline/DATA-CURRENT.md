# DATA-CURRENT.md — current capture vs available surface

> **Co-authored document.** This file lands in two passes:
> - **Pass 1 (AIX-235 · this PR)** — scaffold + cursor section.
> - **Pass 2 (AIX-236)** — claude section + cross-tool summary table.
>
> Cross-references to `./DATA-CURSOR.md` resolve once AIX-233 merges; until then they point to the file's expected location alongside this document. Likewise, `./DATA-CLAUDE.md` lands with AIX-234.
>
> Source of truth for what the cursor side emits: `packages/tools/db90-cursor/src/mapper.ts`. Source of truth for the server-side vocabulary: `packages/api/app/models/tool_event.rb` + the PG enum migration. This document is descriptive, not normative — when it disagrees with the code, the code wins and this file is the bug.

---

## Table of contents

1. [Cursor — What we capture today](#1-cursor--what-we-capture-today)
2. [Cursor — What we ignore today](#2-cursor--what-we-ignore-today)
3. [Cursor — Vocabulary gaps · Rails enums](#3-cursor--vocabulary-gaps--rails-enums)
4. [Cursor — Vocabulary gaps · Web (TypeScript)](#4-cursor--vocabulary-gaps--web-typescript)
5. [Cursor — Sanitization considerations](#5-cursor--sanitization-considerations)
6. [Cursor — Proposed sub-tasks](#6-cursor--proposed-sub-tasks)
7. [Cursor — Risk & rollout](#7-cursor--risk--rollout)
8. [Claude Code — What we capture today](#8-claude-code--what-we-capture-today) _stub — AIX-236_
9. [Claude Code — What we ignore today](#9-claude-code--what-we-ignore-today) _stub — AIX-236_
10. [Claude Code — Vocabulary gaps · Rails enums](#10-claude-code--vocabulary-gaps--rails-enums) _stub — AIX-236_
11. [Claude Code — Vocabulary gaps · Web (TypeScript)](#11-claude-code--vocabulary-gaps--web-typescript) _stub — AIX-236_
12. [Claude Code — Sanitization considerations](#12-claude-code--sanitization-considerations) _stub — AIX-236_
13. [Claude Code — Proposed sub-tasks](#13-claude-code--proposed-sub-tasks) _stub — AIX-236_
14. [Claude Code — Risk & rollout](#14-claude-code--risk--rollout) _stub — AIX-236_
15. [Cross-tool summary](#15-cross-tool-summary) _stub — AIX-236_

---

## 1. Cursor — What we capture today

Validated against `packages/tools/db90-cursor/src/mapper.ts` at HEAD of `feature/AIX-136-epic-baseline`. Three emit paths flow through the mapper today; every field they actually put on the wire is listed below. Numeric and metadata field names are taken verbatim from the `Db90Payload` interface (`mapper.ts:45-55`) and the `Db90PayloadMetadata` type (`mapper.ts:30-43`).

### 1a. Path A — Daily stats (tab + composer aggregates)

Reads `state.vscdb` → `ItemTable.aiCodeTracking.dailyStats.v1.5.<DATE>` (see `cursor-reader.ts:170` for the `v1.5` literal). Handled by `mapDailyStats` (`mapper.ts:164-222`). Emits **one to two** payloads per `<DATE>` row.

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

Reads `state.vscdb` → `ItemTable.aiCodeTracking.recentCommit` (one row per install, overwritten on each new commit; key constant at `cursor-reader.ts:216`). Handled by `mapRecentCommit` (`mapper.ts:228-283`). Emits **at most one** payload per snapshot.

| Domain | Field | Source (mapper.ts line) | Stored as | Enum value used |
|---|---|---|---|---|
| Identity | `tool_name` | `258` | `tool_events.tool_name` | `cursor` |
| Identity | `model` | `260`, hardcoded `"unknown"` | `tool_events.model` | n/a |
| Classification | `event_type` | `259` | `tool_events.event_type` | `chat` _(should be `commit`)_ |
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
| Metadata | `cost_model` | `312` ← `"estimated_line_count"` _(note: misleading — this path uses real tokens, not lines; see §7)_ | `metadata.cost_model` | n/a |
| Metadata | `scannable` | `313`, hardcoded `false` | `metadata.scannable` | n/a |
| Metadata | `risk_level` | `314`, hardcoded `"none"` | `metadata.risk_level` | n/a |

### 1d. Model-keyed fallback path (subset of Path A)

When `mapDailyStats` finds no line-count keys, it iterates over the remaining object entries (`mapper.ts:204-219`) and emits one `chat` payload per model bucket holding `inputTokens` / `outputTokens`. The metadata shape is identical to Path A; the only difference is `model` is set to the bucket key instead of `"unknown"`. This branch is dead code on `v1.5` installs today but ships as forward-compat for `v1.6+`.

### Cross-cutting notes (validated against `mapper.ts`)

- `tool_name` is **always** `"cursor"` (type-narrowed at `mapper.ts:46`).
- `event_type` is **always** one of `"chat"` or `"completion"` (type-narrowed at `mapper.ts:47`) — even the commit snapshot (which should semantically be `"commit"`) is forced into `"chat"`. This is the canonical example of the §3 vocabulary gap.
- `scannable: false` and `risk_level: "none"` are emitted by all three paths because cursor never ships scannable text payloads. They exist in the metadata schema only to keep the server-side risk-scanning pipeline a no-op for cursor events.
- `cost_model` is `"estimated_line_count"` on every path, including Path C where it is technically wrong (Path C does carry real tokens). Cleanup is captured in §6.
- `cursor_session_id` is populated only on Path C. Paths A and B have it as `null`, which means the `ToolEvents::Upsert` dedup path (which keys on `metadata.session_id`, see `upsert.rb:32-34`) does **not** apply to dailyStats or recent-commit events. They follow a different idempotency story driven by `(organization_id, occurred_at, event_type)` natural keys at the database layer.

---

## 2. Cursor — What we ignore today

Cross-refs are forward-links into `./DATA-CURSOR.md` (AIX-233). Until that file lands, the sub-section anchors below should be read as named hooks for the upcoming surface map.

| Source field / signal | What it would tell us | Mapper.ts treatment | DATA-CURSOR.md anchor |
|---|---|---|---|
| `aiCodeTracking.dailyStats.v1.5.<DATE>.<modelKey>.inputTokens` (when present) | Per-model breakdown of daily activity | Only consumed if all four line-count keys are zero (`mapper.ts:204-219`); never combined with line-count rows | `./DATA-CURSOR.md#dailystats-model-buckets` |
| `aiCodeTracking.dailyStats.<other versions, e.g. v1.6>` | New Cursor schema versions | Not read — `v1.5` is hardcoded at `cursor-reader.ts:170` | `./DATA-CURSOR.md#version-pinning` |
| `aiCodeTracking.recentCommit.aiPercentage` _(captured but tagged `chat`)_ | % of commit attributable to AI | Surfaced as `metadata.ai_percentage` but downstream consumers do not slice on it | `./DATA-CURSOR.md#recent-commit` |
| `aiCodeTracking.recentCommit` event-type semantics | This is a commit, not a chat | Forced into `event_type: "chat"` at `mapper.ts:259` | `./DATA-CURSOR.md#recent-commit` |
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
| `cursor-1` | Schema | Add `commit` enum guardrail + retag cursor recent-commit | (a) Verify `commit` is in the PG enum (it is); (b) update `mapper.ts:259` to emit `event_type: "commit"` when `metadata.source === "recent_commit"`; (c) backfill historic rows via one-off rake task. **From TOKENS.md §8 item 1.** | `packages/tools/db90-cursor/src/mapper.ts:259`, `packages/api/lib/tasks/backfill_recent_commit_event_type.rake` _(new)_ |
| `cursor-2` | Schema | Extend `event_type` PG enum + Ruby constant + Swagger | Migration adds `tab_completion`, `composer_chat`, `composer_agent`, `mcp_tool_call`, `inline_edit`, `tab_acceptance`, `background_agent_run`. Update `EVENT_TYPES` constant and `swagger.yaml` in the same commit. | `packages/api/db/migrate/<new>.rb`, `packages/api/app/models/tool_event.rb:12-13`, `packages/api/swagger/v1/swagger.yaml` (Ingest section ~lines 1380–1480) |
| `cursor-3` | Schema | PG↔Ruby enum-invariant CI check | Rake/CI job that diffs `pg_enum` rows against `ToolEvent::EVENT_TYPES`; fails build on drift. Closes the live divergence documented in §3a (`tool_use`, `issue`, `comment`, `sprint` in Ruby but not PG). Also fix the live bug by either adding the missing PG values or removing them from Ruby. | `packages/api/lib/tasks/enum_invariant_check.rake` _(new)_, CI workflow update |
| `cursor-4` | Extractor | Surface `recentCommit.aiPercentage`, `branchName`, `commitHash` as documented `metadata.*` keys | They're already on the wire (per `mapper.ts:269-279`) but undocumented. Add Swagger schema and TS types. **From TOKENS.md §8 item 3.** | `packages/api/swagger/v1/swagger.yaml`, `packages/web/src/lib/types.ts:224-250` |
| `cursor-5` | Extractor | Read `cursorDiskKV` composer sessions | New parser module that scans `cursorDiskKV` for `composerData:<uuid>` blobs, walks the bubble graph, and emits one `composer_chat` (or `composer_agent`) event per session with `composer_id`, `model`, `mcp_server` (if used). **From TOKENS.md §8 item 1 (cursor side).** | `packages/tools/db90-cursor/src/cursor-disk-kv-reader.ts` _(new)_, `packages/tools/db90-cursor/src/mapper.ts`, `packages/tools/db90-cursor/src/index.ts` |
| `cursor-6` | Extractor | Version-prefix discovery (deprecate `v1.5` hardcode) | Replace literal `v1.5` at `cursor-reader.ts:170` with a discovery scan that picks up `v1.5`, `v1.6`, and future versions. Emit a structured log when a new version is observed so we can monitor schema drift. | `packages/tools/db90-cursor/src/cursor-reader.ts:170` |
| `cursor-7` | Sanitization | Extend policy with internal-hostname + customer-identifier patterns | Per §5. Add two regex patterns + redact actions to the default `SanitizationPolicy` seed; backfill `seeds.rb:7-35`; document override mechanism (org-level patterns). | `packages/api/db/seeds.rb:7-35`, `packages/api/app/services/sanitization_service.rb` (if present) |
| `cursor-8` | Sanitization | Server-side metadata allow-list | Tighten `ingest_controller.rb#permitted_params` so `metadata` accepts only the documented standardized keys; unknown keys are dropped (logged at `:info`). Stops payload-shape drift from the CLI side bypassing the documented schema. | `packages/api/app/controllers/api/v1/ingest_controller.rb:127-133` |
| `cursor-9` | Front-end | Replace hardcoded `eventTypes` in `EventFilters.tsx` with summary-driven options | Mirrors the AIX-115 pattern for the tool filter: fetch event-type options from `GET /events/summary` so the UI only shows values present in the org's data. Removes the stale `function_call` / `file_operation` values (per §4). | `packages/web/src/components/events/EventFilters.tsx:50-55`, `packages/web/src/hooks/useEventsSummary.ts` _(new or existing)_ |
| `cursor-10` | Front-end | Recent-commit detail card on event drawer | When `event.metadata.source === "recent_commit"`, render a dedicated detail strip showing `commit_hash`, `branch_name`, `repo_name`, `ai_percentage` (rather than just dumping metadata JSON). Drives §3c adoption. | `packages/web/src/components/events/EventDrawer.tsx`, `packages/web/src/components/events/EventDetail.tsx` |

**Group coverage:** Schema (3) · Extractor (3) · Sanitization (2) · Front-end (2) — all four groups, ten total. Exceeds the ≥ 6 / ≥ 3-of-4 bar.

---

## 7. Cursor — Risk & rollout

| Concern | Detail | Mitigation |
|---|---|---|
| TimescaleDB compression after 7 days | `tool_events` is a hypertable; rows older than 7 days are compressed (chunk-level). Adding columns or changing column types after compression requires uncompress → alter → recompress, which is expensive on the prod hypertable. | All new fields land in `metadata` (JSONB) rather than as new columns. The proposals in §3b/§3c follow this discipline by design. New top-level columns (e.g. `prompt_text`) are explicitly out-of-scope. |
| Retention windows | `tool_events_retention` enum (`30/60/90/180/365/730 days` per the migration) determines how long raw events live before drop. New event types inherit retention by default — no per-type policy. | Document as expected. If a new event type (e.g. `mcp_tool_call`) has substantially different volume, propose a per-type retention story in a follow-up — not in scope for §6. |
| Unique-on-session-id upsert | `ToolEvents::Upsert` (`packages/api/app/services/tool_events/upsert.rb:32-34`) dedups on `metadata->>'session_id'` under advisory lock. Cursor paths A and B emit `cursor_session_id: null`, so neither benefits from this dedup. Cursor path C populates `cursor_session_id` but the dedup key looks for `session_id`, not `cursor_session_id` — they will not collide. | Sub-task `cursor-5` (composerData parser) should emit `metadata.session_id` (canonical key) using the composer UUID, so cursor composer events get the same dedup treatment as Claude Code sessions. Document the `cursor_session_id` legacy key as superseded. |
| `v1.5` hardcode at `cursor-reader.ts:170` | If Cursor bumps the daily-stats schema to `v1.6`, the CLI silently emits zero events until we ship a new release. There is no telemetry today that would alert us to this — just a quiet drop to zero. | Sub-task `cursor-6` (version discovery + structured log on new version) addresses this. Short-term, add a smoke check to `db90-cursor doctor` (if not present) that reports the highest `v*` prefix observed. |
| Backfill on retag (`cursor-1`) | Changing `event_type` on existing rows means dashboards that group by `event_type` will appear to retroactively change. | Backfill rake task should write to `metadata.previous_event_type` so we have an audit trail. Coordinate with whichever dashboards group by `event_type` (the `WeeklyToolUsageChart` and `RiskAlertsTable` from PR #151 merged at `0ceaa46`). |
| Mapper line-count clamping | `mapper.ts:81` clamps negative tokens to zero defensively. If we expose `accepted_lines` as its own metadata key (per §3c), the same clamping discipline must apply. | Keep `nn(n)` helper as the single chokepoint; new fields go through it. |

---

## 8. Claude Code — What we capture today

_TBD by AIX-236. Mirror of §1 against `packages/tools/db90-claude/src/claude-reader.ts`._

## 9. Claude Code — What we ignore today

_TBD by AIX-236. Mirror of §2 against `./DATA-CLAUDE.md` (from AIX-234)._

## 10. Claude Code — Vocabulary gaps · Rails enums

_TBD by AIX-236. Pre-populate from TOKENS.md §8 items 2 + 4: tool_use breakdown, sub-agent / skill tagging._

## 11. Claude Code — Vocabulary gaps · Web (TypeScript)

_TBD by AIX-236. Note §4 above already documents the live divergence in `types.ts:214-222` and `EventFilters.tsx:50-55`; the claude section should focus on additional values the claude side needs (e.g. `tool_use` granularity, `subagent_run`, `skill_run`)._

## 12. Claude Code — Sanitization considerations

_TBD by AIX-236. The claude side is more delicate because the JSONL transcript on disk includes full prompt + response text, so even though we explicitly don't capture it today (per §7 of TOKENS.md), every proposal must affirm the no-text rule._

## 13. Claude Code — Proposed sub-tasks

_TBD by AIX-236. Pre-populate from TOKENS.md §8 items 2–4: extract `tool_use` blocks, surface `entrypoint`/`advisorModel`/`gitBranch`/`iterations`/`stop_reason`/`service_tier`, sub-agent + skill tagging._

## 14. Claude Code — Risk & rollout

_TBD by AIX-236. Focus on JSONL transcript file growth (re-send semantics), `ToolEvents::Upsert` dedup on `metadata.session_id` (the dedup key cursor paths A/B don't share — see §7 above), and the prompt-text egress story._

---

## 15. Cross-tool summary

_TBD by AIX-236. The headers below are pre-filled; cells land in pass 2._

| Dimension | Cursor today | Claude Code today | Gap |
|---|---|---|---|
| `event_type` coverage | `chat`, `completion` only (2/14) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Commit detection | Captured but mis-tagged as `chat` (§1b) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Tool-use granularity | None (single aggregate per day) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Sub-agent / skill markers | n/a (no analogue in Cursor today) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Cache token capture | n/a (Cursor cost is line-based) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Service tier / region | Not exposed | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Model attribution | `unknown` on aggregates, real on Path C | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Session dedup | Only Path C (legacy rows) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Sanitization scope | Metadata-only (no prompt text) | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Prompt-text policy | Out of scope this epic | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Version pinning | `v1.5` hardcoded at `cursor-reader.ts:170` | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Local-store schema risk | High — `cursorDiskKV` blobs undocumented and per-version | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Background-agent / autonomous runs | Not captured | _TBD by AIX-236_ | _TBD by AIX-236_ |
| Cost model | `estimated_line_count` (with one path mis-tagged) | _TBD by AIX-236_ | _TBD by AIX-236_ |

---

_Generated for AIX-235. Companion document: `./TOKENS.md`. Forward references: `./DATA-CURSOR.md` (AIX-233), `./DATA-CLAUDE.md` (AIX-234), this file's claude section + §15 (AIX-236)._
