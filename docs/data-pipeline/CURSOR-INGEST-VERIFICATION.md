# Cursor ingest verification — `db90-cursor` vs `docs/data-pipeline`

> **Audience:** engineers validating Cursor → Aixle Insights ingest before extending extractors or dashboards.  
> **Sources:** `packages/tools/db90-cursor/` (`sync.ts`, `cursor-reader.ts`, `mapper.ts`), `docs/data-pipeline/DATA-CURSOR.md`, `docs/data-pipeline/DATA-CURRENT.md`.  
> **Validated at:** repo HEAD (May 2026). When code and docs disagree, **code wins** — update this file after fixes.

---

## What actually ships today

`collectSyncPayloads` (`collect-payloads.ts`) orchestrates all three paths; `sync.ts` posts them and advances watermarks in credential-scoped files under `~/.db90-cursor/` (`state-<hostname>-<token-hash>.json`: `lastProcessedAt` for daily/legacy, `lastRecentCommitAt` for commits).

| Path | Reader | Mapper | Wired in `sync.ts`? | Context quality |
|------|--------|--------|---------------------|-----------------|
| **A — Daily stats** | `readDailyStats` (+ dedupe) | `mapDailyStats` | Yes | Day-bucketed lines; `model: "unknown"`; no session; `workspace` = SQLite path |
| **B — Recent commit** | `readRecentCommitSnapshots` | `mapRecentCommit` (`event_type: "commit"`) | Yes (CUR-V01) | Rich metadata (`commit_hash`, `repo_name`, `branch_name`, `ai_percentage`); separate commit watermark |
| **C — Legacy per-request** | `readEvents` | `mapEvent` | Yes (often empty on modern Cursor) | Real tokens + model + `cursor_session_id` when `cursor.db` exists |

`@db90/telemetry-mcp` `runCursorSlice` matches CLI for daily stats, legacy events, and recent commit (CUR-V01). MCP additionally emits **agent transcript** turns (`readCursorTranscriptSessions`) with `session_id`, optional scannable text, and risk scan — **not** in standalone `db90-cursor`.

Dry-run helpers: `validateCursorPayload` (`payload-contract.ts`), `npm run verify:dry-run-matrix`, CLI `--full` to ignore watermark.

---

## Doc drift

Reconciled in **CUR-V09** (May 2026): `DATA-CURRENT.md` §1/§1b/§1e, `TOKENS.md` §1–§3/§6/§8, `DATA-CURSOR.md` §1/§2.8/§3.5. Path B wired; `event_type: commit` documented throughout.

---

## Context gaps (information vs attribution)

| Signal | In Cursor store | On wire today | Context problem |
|--------|-----------------|---------------|-----------------|
| Tab vs Composer volume | `tab*Lines` / `composer*Lines` | Yes (`completion` / `chat`) | Composer + Chat panel merged; inline edits not separable |
| Model name | Legacy `cursor.db` only | Only Path C | Auto-mode → `"unknown"` on daily stats |
| Session / composer ID | `cursorDiskKV` `composerData:*` | No | `cursor_session_id: null` on paths A/B |
| Repo / branch / commit | `recentCommit` | Yes (Path B) | `repo_name` in metadata; used for commit `project_id` when not explicit |
| Project attribution | `repoName`, workspace hash | See **CUR-V04** below | Daily/legacy: CWD only; commits: `repo_name` lookup when no `--project-id`/config |
| Workspace identity | `workspaceStorage/<hash>/` | `metadata.workspace` = DB path; `workspace_scope` + optional `workspace_folder` (CUR-V05) | Human folder when `workspace.json` present; global rollups tagged `global` |
| Cursor app version | App bundle / logs | No | Can't correlate schema drift (`v1.5` hardcode) |
| Per-turn tool/MCP usage | Hooks / `bubbleId:*` | No | Richest context surface unread (`DATA-CURSOR.md` §2.6, §2.11) |

### Other risks

- **`v1.6+` schema drift** — reader matches any `aiCodeTracking.dailyStats.v*.<date>` key; unknown JSON shapes still need mapper work (`cursor-6`). Run `audit:local-stores` to see installed prefixes.
- **Daily-stats dedupe (CUR-V06)**: `readDailyStats` dedupes by date, preferring `globalStorage/state.vscdb`. Workspace-only dates are kept; identical workspace JSON for the same date is collapsed once.

---

## Outbound payload reference (what mapper can emit)

See `packages/tools/db90-cursor/src/mapper.ts` (`Db90Payload`, `Db90PayloadMetadata`) and `DATA-CURSOR.md` §3.5.

**Top-level:** `tool_name`, `event_type`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `occurred_at`, optional `project_id`.

**Metadata:** `cursor_session_id`, `workspace`, `cost_model` (`"estimated_line_count"`), `scannable`, `risk_level`, and for recent commit only: `source`, `commit_hash`, `commit_message`, `repo_name`, `branch_name`, `ai_percentage`.

**Lines vs tokens:** Cursor `dailyStats` stores **lines**; mapper stores them in `tokens_in` / `tokens_out` and estimates cost via `tokens_per_line` (default 15). Legacy `cursor.db` rows can carry real `promptTokens` / `generatedTokens`.

---

## Verification subtasks

Sized for Jira/Linear; each has a clear pass/fail.

### P0 — Prove what reaches Aixle Insights

| ID | Subtask | Steps | Pass criteria |
|----|---------|-------|---------------|
| **CUR-V01** | **Wire recent-commit into sync (CLI + MCP)** | ✅ Shipped — `sync.ts` + MCP `runCursorSlice` + `lastRecentCommitAt` / `CURSOR_RECENT_COMMIT_WATERMARK_KEY`. | After a local commit in Cursor, `db90-cursor --dry-run --verbose` shows one payload with `event_type: "commit"`, `metadata.source: "recent_commit"`, `commit_hash`, `ai_percentage`. Event appears in Aixle Insights ingest / `tool_events`. |
| **CUR-V02** | **End-to-end dry-run matrix** | ✅ Shipped — `payload-contract.ts` validates §3.5; dry-run prints matrix; `npm run verify:dry-run-matrix` writes local samples to `fixtures/cursor-dry-run-matrix.json` (gitignored). | Payload set matches `DATA-CURSOR.md` §3.5 field table; no unexpected keys; `cost_model: "estimated_line_count"` on all line-based paths. |
| **CUR-V03** | **Sync integration test for Path B** | ✅ Shipped in CUR-V01 — `src/test/sync.test.ts`. | Temp `state.vscdb` with `recentCommit` → `syncOnce` → POST mock asserts commit payload. |

### P1 — Context & attribution correctness

| ID | Subtask | Steps | Pass criteria |
|----|---------|-------|---------------|
| **CUR-V04** | **Project attribution vs Cursor `repoName`** | ✅ Shipped — `enrichCommitProjectAttribution` (`@db90/sdk`): for `event_type: commit`, lookup `GET /projects/lookup` using `metadata.repo_name` → `https://github.com/{slug}` + SSH candidate; skips when `--project-id` or config `project_id` set. | Wrong-CWD sync still attributes commit to repo in `recentCommit`; daily stats stay CWD-based. GitLab-only slugs need full remote in Aixle Insights project settings (GitHub slug assumed). |
| **CUR-V05** | **`workspace` metadata semantics** | ✅ Shipped — keep `metadata.workspace` as SQLite path (stable); add `workspace_scope` (`global` \| `workspace`) and optional `workspace_folder` from `workspace.json` when resolvable. | Global daily stats: `workspace_scope: global`, no folder. Workspace DB: scope `workspace` + folder when `workspace.json` exists. Legacy uses hash dir as `workspace`. |
| **CUR-V06** | **Daily-stats dedupe audit** | ✅ Shipped — `dedupeDailyStatsEntries` in `cursor-reader.ts` (and MCP parity): per calendar date, prefer `globalStorage/state.vscdb`; collapse identical workspace copies. | On Ana's Mac (May 2026): 19 keys only in global, 0 workspace overlaps — 22 sent events = 19 days × (tab and/or composer payloads) + 1 commit, not double DB reads. Dedupe guards installs that mirror the same date into workspace DBs. |
| **CUR-V07** | **Legacy `cursor.db` presence check** | ✅ Tooling — `npm run audit:local-stores` in `db90-cursor` (`store-audit.ts`). Run on macOS laptops; see [CUR-V07 results](#cur-v07-results) below. | Record % with zero `cursor.db` vs active `state.vscdb`; sets expectation for Path C value. |

### P1 — Schema / classification fidelity

| ID | Subtask | Steps | Pass criteria |
|----|---------|-------|---------------|
| **CUR-V08** | **`event_type: commit` ingest acceptance** | ✅ API — `packages/api/spec/requests/api/v1/ingest_spec.rb` (cursor recent_commit → 202 + `event_type: commit`). Staging: `npm run verify:commit-ingest` with `DB90_HOST` + `DB90_TOKEN`. | `202 Accepted`; row stored with `event_type = commit` (PG enum includes it; `ToolEvent::EVENT_TYPES`). |
| **CUR-V09** | **Reconcile docs with code** | ✅ Shipped — `DATA-CURRENT.md` §1/§1b/§1e/§2/§6/§15, `TOKENS.md` §1–§3/§6/§8, `DATA-CURSOR.md` §1/§2.8/§3.5. | Docs match code: Path B wired; `event_type: commit`; `cursor-1` marked done. |
| **CUR-V10** | **Path C `cost_model` truthiness** | ✅ Shipped — `mapEvent` (legacy `cursor.db`) sets `metadata.cost_model: "token_count"`; line paths keep `"estimated_line_count"`. Contract + mapper tests. | Legacy rows use token-based cost formula; daily/commit paths unchanged. |

### P2 — Coverage vs vendor surface (`DATA-CURSOR.md`)

| ID | Subtask | Steps | Pass criteria |
|----|---------|-------|---------------|
| **CUR-V11** | **`v1.5` / `v1.6` key discovery** | ✅ Shipped — `npm run audit:local-stores` reports `daily_stats_versions` (CUR-V11). | List all version prefixes; if `v1.6+` exists, open extractor task (`cursor-6`). |
| **CUR-V12** | **`cursorDiskKV` spot-check** | ✅ Shipped — `npm run spotcheck:disk-kv` (read-only; redacted output). | Observed shapes validated; per-session ingest **out of scope** for AIX-235 → `cursor-5`. |
| **CUR-V13** | **Hooks feasibility sample** | ✅ Shipped — `install:hooks-feasibility` + `verify:hooks-feasibility` (file log, no POST). | `model`, `conversation_id`, `workspace_roots` present on captured events. |
| **CUR-V14** | **CLI vs MCP parity matrix** | ✅ Shipped — `npm run verify:cli-mcp-parity`. | Shared paths match; MCP adds transcripts; daily composer suppressed on MCP when JSONL present (equivalent coverage). |

### P2 — Product / dashboard readiness

| ID | Subtask | Steps | Pass criteria |
|----|---------|-------|---------------|
| **CUR-V15** | **Commit detail UI smoke** | ✅ Shipped — `RecentCommitDetail` in Events drawer + detail page (`cursor-10`). | `commit_hash`, `branch_name`, `ai_percentage` visible when `event_type=commit` or `metadata.source=recent_commit`. |
| **CUR-V16** | **Sanitization on `commit_message`** | ✅ Shipped — Path 1 metadata scan in `ClassificationActivity`; `npm run verify:commit-message-sanitization`; RSpec `cursor_commit_sanitization_spec.rb`. | Fake `api_key=` in `commit_message` → `requires_sanitization`; redacted to `[REDACTED]` before persist (Temporal path). |

---

## CUR-V07 results

Run on each engineer Mac (Cursor closed or read-only is fine):

```bash
cd packages/tools/db90-cursor
npm run audit:local-stores
# optional: npm run audit:local-stores -- --json-out ~/cursor-audit.json
```

If SQLite probe fails: `cd packages/tools && npm rebuild better-sqlite3`, then re-run.

| Machine | Date | `cursor.db` files | `CursorRequestFeedback` rows | Global `dailyStats` keys | Path C verdict | Notes |
|---------|------|-------------------|----------------------------|-------------------------|----------------|-------|
| Ana (darwin) | 2026-05-27 | **0** | **0** | **19** (global only; 24 workspace `state.vscdb`, 0 with dailyStats) | `no_legacy_dbs` | Matches prior `--verbose` sync (`legacy=0`). Path C contributes **no** payloads; Paths A/B sufficient. |
| Engineer 2 | _pending_ | | | | | |
| Engineer 3 | _pending_ | | | | | |

**Team expectation (modern Cursor, May 2026):** treat Path C as **optional / often empty**. Keep `readEvents` wired for older installs, but do not block dashboards or verification on legacy rows. When `path_c_verdict` is `legacy_has_rows`, Path C adds real `model` + token counts per request.

---

## CUR-V11 results

```bash
cd packages/tools/db90-cursor
npm run audit:local-stores
```

| Machine | Date | Versions found | Highest | v1.6+ / unmatched | cursor-6? |
|---------|------|----------------|---------|-------------------|-----------|
| Ana (darwin) | 2026-05-27 | **v1.5** (19 keys) | v1.5 | none | No — ingest OK for current layout |
| Engineer 2 | _pending_ | | | | |

Sample keys on Ana's Mac: `aiCodeTracking.dailyStats.v1.5.2026-02-16` … `2026-05-27`.

---

## CUR-V12 results

```bash
cd packages/tools/db90-cursor
npm run spotcheck:disk-kv
# optional: npm run spotcheck:disk-kv -- --json-out ~/disk-kv-spotcheck.json
```

| Machine | Date | `composerData` | `bubbleId` | Observed shape | §2.2 example JSON | Ingest scope |
|---------|------|----------------|------------|----------------|-------------------|--------------|
| Ana (darwin) | 2026-05-27 | 194 | ~10.1k | ✅ `_v`, `unifiedMode`, epoch `createdAt` on composer; ISO `createdAt` on bubble; `toolFormerData` object (not array) | ❌ doc example is simplified / older | **Out of scope** AIX-235 → `cursor-5` |

Sample resolved fields (Ana's Mac): composer `unifiedMode: "agent"`, `_v: 16`; bubble `type: 2`, `toolFormerData.name: run_terminal_command_v2`.

---

## CUR-V13 results

Install (user-level `~/.cursor/hooks.json`, backs up any existing file):

```bash
cd packages/tools/db90-cursor
npm run install:hooks-feasibility
# Restart Cursor, use Agent/Composer (Auto mode OK), then:
npm run verify:hooks-feasibility
# Synthetic smoke (no Cursor session): npm run verify:hooks-feasibility -- --smoke
```

Log: `~/.cursor/db90-hooks-feasibility.ndjson` (redacted NDJSON; no db90 POST).

| Machine | Date | Config installed | Log events | Required fields | Notes |
|---------|------|------------------|------------|-----------------|-------|
| Ana (darwin) | 2026-05-27 | ✅ `~/.cursor/hooks.json` | 1 (smoke `postToolUse`) | ✅ smoke | **Restart Cursor** + Agent session for live Auto-mode capture; re-run `verify:hooks-feasibility` |
| Engineer 2 | _pending_ | | | | |

**Scope:** hook-driven ingest remains **exploratory / out of scope** for AIX-235; hooks are the only local surface with resolved `model` under Auto mode (`DATA-CURSOR.md` §2.11).

---

## CUR-V14 results

```bash
cd packages/tools/db90-cursor
npm run verify:cli-mcp-parity
# optional: npm run verify:cli-mcp-parity -- --json-out ~/cli-mcp-parity.json
```

| Path | CLI | MCP | Notes |
|------|-----|-----|-------|
| `daily_tab` | ✅ | ✅ | Same counts (line aggregates) |
| `daily_composer` | ✅ | — (suppressed) | MCP skips when agent-transcripts exist; use transcript turns instead |
| `legacy_request` | ✅ | ✅ | Both 0 on modern Cursor (Path C inactive) |
| `recent_commit` | ✅ | ✅ | Same (CUR-V01) |
| `mcp_transcript` | — | ✅ | **MCP-only** — `~/.cursor/projects/**/agent-transcripts/*.jsonl` |

| Machine | Date | Parity | MCP transcripts |
|---------|------|--------|-----------------|
| Ana (darwin) | 2026-05-27 | ✅ | 290 turns — daily composer deduped on MCP side |
| Engineer 2 | _pending_ | | |

**MCP-only orgs:** no silent gap — transcripts replace daily composer chat when JSONL is present; otherwise MCP matches CLI.

---

## CUR-V15 — commit detail UI

**Code:** `packages/web/src/components/events/RecentCommitDetail.tsx` (drawer + full page).

**Manual smoke:**

1. Ingest a commit event (`npm run verify:commit-ingest` or `db90-cursor` sync after a Cursor commit).
2. Open **Events** → filter type **commit** (or tool **Cursor**).
3. Open the event drawer — confirm **Commit attribution** shows:
   - Commit (short hash, full on hover)
   - Branch
   - AI contribution %
   - Repository (when present)

| Machine | Date | Drawer | Full page |
|---------|------|--------|-----------|
| Ana | _pending manual_ | | |
| Engineer 2 | _pending_ | | |

---

## CUR-V16 — commit_message sanitization

**Code:** `temporal/activities/classification_activity.rb` (Path 1 scans metadata when `scannable: false`), `sanitization_activity.rb`.

**Automated (CI):**

```bash
cd packages/api
bundle exec rspec spec/temporal/cursor_commit_sanitization_spec.rb \
  spec/temporal/activities/classification_activity_spec.rb \
  spec/temporal/activities/sanitization_activity_spec.rb
```

**Manual (Temporal worker + ingest token):**

```bash
cd packages/tools/db90-cursor
DB90_HOST=http://localhost:3000 DB90_TOKEN=db90_... npm run verify:commit-message-sanitization
```

| Check | Expected |
|-------|----------|
| HTTP status | **202** (not `fallback: true` — fallback skips sanitization) |
| `metadata.commit_hash` | `cur-v16-verify-deadbeef` |
| `metadata.commit_message` | Does **not** contain `a fake Stripe key`; includes `[REDACTED]` |

| Machine | Date | Temporal path | Redacted |
|---------|------|---------------|----------|
| Ana | _pending manual_ | | |
| CI | 2026-05-27 | RSpec pipeline | ✅ |

**Note:** Ingest **fallback** (Temporal down) persists metadata verbatim — local `verify:commit-ingest` with `fallback: true` is not a CUR-V16 pass.

**Local dev checklist (no fallback):**

1. `make up` — postgres, minio, temporal, api
2. `make worker` — Temporal worker (`db90-tasks` queue)
3. API must have `temporalio` gem + `docker compose exec api bundle install` after Gemfile changes; restart api
4. If logs show `uninitialized constant Temporalio` → missing gem/require (fixed in `Temporal::Client`)
5. If worker logs `Workflow type Workflows::IngestionSanitizationWorkflow is not registered` → workflow name mismatch (API uses `IngestionSanitizationWorkflow`)

---

## CUR-V08 — staging ingest check

**Automated (CI):** `packages/api/spec/requests/api/v1/ingest_spec.rb` — cursor `recent_commit` payload → `202 Accepted`, Temporal receives `event_type: commit`; fallback insert persists `ToolEvent` with `event_type` and metadata.

**Manual (staging or local):**

```bash
cd packages/tools/db90-cursor
DB90_HOST=https://<staging-host> DB90_TOKEN=db90_<cursor-ingest-token> npm run verify:commit-ingest
```

| Check | Expected |
|-------|----------|
| HTTP status | **202** |
| Response body | `{ "data": { "accepted": true, ... } }` |
| DB / UI | Row with `tool_name=cursor`, `event_type=commit`, `metadata.commit_hash=cur-v08-verify-deadbeef` |

| Local (`http://localhost:3000`) | 2026-05-27 | **202**, `accepted: true`, `fallback: true` | Ana — `verify:commit-ingest` |

Staging URL run: _optional_ (same command with staging `DB90_HOST`).

---

## Recommended implementation order

1. **CUR-V01 + V03 + V08** — unblock commit signal and tests  
2. **CUR-V02 + V06 + V11** — validate real Cursor DB shapes on hardware  
3. **CUR-V11** — dailyStats version key discovery (V04–V09 + V07–V08 done; run `verify:commit-ingest` on staging when token available)  
4. **CUR-V12–V14** — gap analysis for per-turn context (composer/MCP/hooks)  
5. Align with `DATA-CURRENT.md` §6 (`cursor-5` diskKV, `cursor-6` version discovery, etc.) only after P0 verification passes  

---

## Bottom line

- **Proper information:** Daily tab/composer **line aggregates** are gathered and mapped correctly for what Cursor stores in `dailyStats.v1.5.*`.  
- **Proper context:** **Weak for aggregates, stronger for commits** — no model on daily stats, no session IDs, workspace is a DB path, project ID is CLI/git-remote—not Cursor’s `repoName`. Commit attribution (`ai_percentage`, branch, hash) **ships** via Path B (CUR-V01).  
- **Richest Cursor context** (per-turn model, tools, MCP, hooks) is documented in `DATA-CURSOR.md` but **out of scope** for current `db90-cursor`; MCP transcripts are a partial step toward session-level context.

---

## Cross-references

| Document | Role |
|----------|------|
| [`DATA-CURSOR.md`](./DATA-CURSOR.md) | Vendor surface map (what Cursor exposes) |
| [`DATA-CURRENT.md`](./DATA-CURRENT.md) | What we capture today + proposed implementation sub-tasks (`cursor-1` … `cursor-10`) |
| [`TOKENS.md`](./TOKENS.md) | Baseline enum taxonomy (May 2026) |
| `packages/tools/db90-cursor/src/sync.ts` | Orchestration (what actually runs on sync) |
| `packages/tools/db90-cursor/src/mapper.ts` | Payload shape and mapping rules |
