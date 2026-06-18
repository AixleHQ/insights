# Story: Server-side event_type re-tagger — defensive net for pre-T-02 CLIs (AIX-260)

Status: done

Completion note: Ultimate context engine analysis completed - comprehensive developer guide created. Design revised per team decision: normalization lives in `ToolEvents::Upsert`, not a Temporal activity.

Jira: [AIX-260](AIX-260) · Epic: [AIX-258](AIX-258) "Event-type expansion + metadata enrichment for CLI connectors" (T-03, Phase 1)

## Story

As a DB90 product user reviewing AI-tool usage analytics,
I want the ingest pipeline to re-tag `chat` events into finer event types (`commit`, `test`, `edit`) using their metadata,
so that older CLIs in the field (pre-T-02) and Cursor connectors without T-01 still produce accurate event-type breakdowns after the server upgrade ships.

## Design decision (supersedes the Jira sketch — do not re-litigate)

The Jira description prescribes a new Temporal activity inserted into `IngestionSanitizationWorkflow`. **The team decided against it as overkill**: the re-tag is a pure, deterministic, zero-I/O transformation — it needs no durability, retries, or orchestration (project rule: Temporal only for durable multi-step workflows). Instead, normalization happens in **`ToolEvents::Upsert`** (`packages/api/app/services/tool_events/upsert.rb`), the single chokepoint every persistence path already flows through:

| Entry path | Route to persistence | Covered? |
|---|---|---|
| `POST /api/v1/ingest/events` → Temporal workflow | `PersistenceActivity` → `POST /api/internal/tool_events` → `Upsert` | ✅ |
| `POST /api/v1/ingest/events` → Temporal unavailable | `fallback_direct_insert` → `Upsert` | ✅ (the Temporal-activity design missed this) |
| `TelemetryController` → Temporal workflow | same internal API → `Upsert` | ✅ (a controller-level hook in IngestController would have missed this) |

`Upsert` already performs exactly this kind of pre-persist enrichment (`promote_model_from_metadata!`, `enrich_cost!` + `cost_source` metadata stamp) — normalization is a third step in the same idiom. Bonus: everything runs inside Rails, so the ticket's `config.x.ingest.event_type_renormalization` flag works literally, and the Jira request-spec AC is literally testable.

Out of scope: `ToolEvents::ConnectorUpsert` (webhook connector dedupe path) — connector webhooks don't emit CLI `chat` events.

## Acceptance Criteria

1. A new pure-Ruby service `EventTypeNormalizer` exists at `packages/api/app/services/event_type_normalizer.rb`. Given `event_type` and `metadata`, it derives a finer type for `chat` events, first matching rule wins:
   - `metadata.source == "recent_commit"` → `"commit"` (Cursor recent-commit path)
   - `metadata.bash_command` matching `\A\s*git\s+commit\b` → `"commit"`
   - `metadata.bash_command` matching `(rspec|jest|vitest|pytest|go\s+test|mocha)\b` → `"test"`
   - `metadata.tool_name` ∈ {`Edit`, `Write`, `MultiEdit`, `NotebookEdit`} → `"edit"`
   - Returns `nil` (no re-tag) when `event_type != "chat"`, metadata is nil/empty, or no rule matches.
2. `ToolEvents::Upsert#call` invokes normalization (e.g. `normalize_event_type!`) alongside the existing `promote_model_from_metadata!` / `enrich_cost!` steps. On re-tag, `@attributes[:event_type]` is replaced and `@attributes[:metadata]` gains `"renormalized_from" => <original>` and `"renormalized_by" => "server_v1"`. All other attributes (`tokens_in`, `tokens_out`, `cost_usd`, `occurred_at`, `model`, `duration_ms`, ids) untouched.
3. Metadata key access is defensive about string vs symbol keys, following the existing `Upsert` idiom (`dig(:metadata, "session_id") || dig(:metadata, :session_id)`) — the internal-API path delivers string-keyed metadata under a symbolized top level; the fallback path likewise.
4. Feature flag per the ticket, now genuinely usable since this is Rails code — in `packages/api/config/application.rb`:
   ```ruby
   config.x.ingest.event_type_renormalization =
     ENV.fetch("DB90_EVENT_TYPE_RENORMALIZATION", Rails.env.production? ? "false" : "true") == "true"
   ```
   With the flag off, `Upsert` skips normalization entirely (no `renormalized_*` keys, event persists as sent).
5. Request spec (Jira AC #1, now literally satisfiable): `POST /api/v1/ingest/events` with a `chat` event carrying `metadata.source = "recent_commit"` → persisted `tool_events` row has `event_type = "commit"` and `metadata.renormalized_from = "chat"`. (In test env the controller takes `fallback_direct_insert` → `Upsert`, which is a covered path by design.)
6. With the flag stubbed off, the same request persists as `chat` (Jira AC #2).
7. Unit specs cover re-tagging of `git commit ...` and `rspec`-style bash commands (Jira AC #3), the `tool_name → edit` rule, non-`chat` passthrough, nil/empty metadata passthrough, and boundary negatives (`"git commitish"` and `"mochaccino"` must NOT match).
8. Already-typed events (`commit`, `tool_use`, `completion`, …) pass through byte-identical — no `renormalized_*` keys on non-re-tagged events.
9. All re-tag target values (`commit`, `test`, `edit`) are already valid in both `ToolEvent::EVENT_TYPES` and PG enum `public.event_type` — verified, **no migration needed or allowed**.
10. No controller, route, or Temporal changes. No Swagger changes (request/response shapes unchanged). RuboCop passes (`make lint-api`).

## Tasks / Subtasks

- [x] Create `packages/api/app/services/event_type_normalizer.rb`. (AC: 1)
  - [x] Module or class with a single class-level entry point, e.g. `EventTypeNormalizer.derive(event_type:, metadata:) -> String | nil`.
  - [x] Freeze rule constants: `EDIT_TOOLS = %w[Edit Write MultiEdit NotebookEdit]`, `GIT_COMMIT_PATTERN = /\A\s*git\s+commit\b/`, `TEST_RUNNER_PATTERN = /(rspec|jest|vitest|pytest|go\s+test|mocha)\b/`.
  - [x] Pure function: no DB, no Rails config reads inside (flag check lives in the caller), no mutation of inputs.
  - [x] Handle string/symbol metadata keys via a small fetch helper (`meta["source"] || meta[:source]` style or `dig`-both, matching `Upsert`'s existing idiom).

- [x] Wire into `ToolEvents::Upsert`. (AC: 2-4, 8)
  - [x] Add `normalize_event_type!` to `#call` next to `promote_model_from_metadata!` / `enrich_cost!` (before the create/upsert branch).
  - [x] Guard: `return unless Rails.application.config.x.ingest.event_type_renormalization`.
  - [x] On non-nil derive result differing from original: set `@attributes[:event_type]`, merge `renormalized_from`/`renormalized_by` into `@attributes[:metadata]` (string keys, matching the existing `cost_source` merge style).
  - [x] Note: `event_type` is intentionally NOT in `MUTABLE_FIELDS`, so session re-sends (dedupe-update path) never flip an existing row's type — normalization effectively applies at create. Keep it that way; document with a one-line comment only if non-obvious in situ.

- [x] Add the feature flag. (AC: 4) — **implemented as `Upsert#renormalization_enabled?` reading ENV directly (Kirill's call during dev); `application.rb` untouched, same env-var semantics.**
  - [x] ~~`packages/api/config/application.rb`: the `config.x.ingest.event_type_renormalization` line per AC 4~~ superseded: ENV check lives in `ToolEvents::Upsert`.

- [x] Write specs. (AC: 5-8)
  - [x] `packages/api/spec/services/event_type_normalizer_spec.rb` — pure unit spec for every rule + negatives/boundaries (no DB).
  - [x] Extend `packages/api/spec/services/tool_events/upsert_spec.rb` (exists — find exact path with `ls spec/services/tool_events/`) — re-tag applied on create, `renormalized_*` metadata stamped, flag-off skip, non-chat passthrough. Stub the flag via `allow(Rails.application.config.x.ingest).to receive(:event_type_renormalization).and_return(...)`.
  - [x] Extend `packages/api/spec/requests/api/v1/ingest_spec.rb` — the end-to-end AC 5/6 cases through `POST /api/v1/ingest/events` (real DB, no mocking — fallback path persists synchronously in test env).

- [x] Verify. (AC: 9, 10)
  - [x] From `packages/api/`: `bundle exec rspec spec/services/event_type_normalizer_spec.rb spec/services/tool_events/ spec/requests/api/v1/ingest_spec.rb`.
  - [x] `make lint-api`.

### Review Findings (2026-06-12, adversarial code review)

- [x] [Review][Decision] Regex rules over/under-match vs real-world bash commands — **resolved 2026-06-12 (Kirill): keep as-is per AC 1**; false positives accepted, the rules are a defensive net and match the spec exactly.
- [x] [Review][Patch] Strip client-supplied `renormalized_*` keys from incoming metadata [packages/api/app/services/tool_events/upsert.rb] — **applied 2026-06-12**: `RESERVED_METADATA_KEYS` + `strip_reserved_metadata!` first in the `#call` pipeline, unconditional (flag off included), strips string and symbol key variants; 4 new specs incl. re-stamp-after-strip.
- [x] [Review][Patch] Dedupe-update path stamps `renormalized_*` onto a row that was never re-tagged [packages/api/app/services/tool_events/upsert.rb] — **applied 2026-06-12**: `normalize_event_type!` moved out of `#call` into the two create branches only; regression spec extended to assert no `renormalized_*` keys on the existing row after a hinted re-send.
- [x] [Review][Patch] Non-Hash metadata / non-String bash_command not type-guarded [packages/api/app/services/event_type_normalizer.rb] — **applied 2026-06-12**: `metadata.is_a?(Hash)` guard; regex rules run only when `bash_command.is_a?(String)`; 3 new malformed-type specs.
- [x] [Review][Patch] Feature flag accepts only the exact lowercase string `"true"` [packages/api/app/services/tool_events/upsert.rb] — **applied 2026-06-12**: `ActiveModel::Type::Boolean` cast (`TRUE`/`1`/`yes` → on, `FALSE`/`0`/`off` → off, defaults unchanged); 3 new flag-spelling specs.

Review verification 2026-06-12: full API suite 2535 examples / 0 failures; `make lint-api` clean (independently re-run, closing the auditor's AC 10 note).
- [x] [Review][Defer] Same-session re-send wholesale-replaces `metadata`, wiping `renormalized_*`/`source` provenance from a previously re-tagged row [packages/api/app/services/tool_events/upsert.rb:126,135-137] — deferred, pre-existing: `MUTABLE_FIELDS` metadata-replace semantics predate this story (also affects `cost_source`); fixing means merge-not-replace on the update path, a separate change.

## Dev Notes

### Business context (from Jira)

After T-02 ships, older CLIs keep emitting `chat` for everything. This server-side normalizer makes the upgrade resilient: pre-T-02 CLIs gain finer `event_type` tagging from metadata they already send. It also covers Cursor installs without T-01 — the server re-tags `chat` + `metadata.source = "recent_commit"` as `commit`. Related prior art: `cursor-recent-commit-event-type.md` fixed the same misclassification client-side in `@db90/cursor`; this story is the server-side defensive net for clients without that fix.

### Current state of `ToolEvents::Upsert` (the file being modified)

`packages/api/app/services/tool_events/upsert.rb` — creates or updates a `tool_event`, deduplicating on `metadata.session_id` (app-layer uniqueness because TimescaleDB hypertable unique indexes must include `occurred_at`; `pg_advisory_xact_lock` serialises concurrent same-session requests). `#call` pipeline today: `promote_model_from_metadata!` → `enrich_cost!` (may stamp `metadata.cost_source`) → create or locked-upsert. `MUTABLE_FIELDS` (update path) = tokens/cost/model/duration/project_id/metadata — **not** `event_type`. Callers: `Api::InternalController#create_tool_event` (Temporal `PersistenceActivity` posts here) and `Api::V1::IngestController#fallback_direct_insert`. Both call with `.symbolize_keys` on the top level; nested metadata keys remain strings.

**What this story changes:** adds one enrichment step to `#call` plus the normalizer service it delegates to.

**What must be preserved:**
- The advisory-lock dedupe flow and `MUTABLE_FIELDS` exactly as-is (a recent race-condition fix lives here — see `auth-race-condition-fix.md` era work; don't touch the locking).
- `enrich_cost!` ordering and `cost_source` stamping — normalization must not clobber `cost_source` (merge, don't replace, metadata).
- `promote_model_from_metadata!` behavior (recent AIX-192 work).
- Non-`chat` events byte-identical passthrough — double-tagging an already-`commit` event with `renormalized_*` metadata would be misleading.

### Why metadata still has what we need on the Temporal path

`PersistenceActivity#metadata_from_sanitized` builds the metadata posted to the internal API: starts from the event's own metadata, overlays metadata from the *sanitized* raw payload, then merges sanitization/risk stats. `source`, `bash_command`, `tool_name` keys survive this (sanitization redacts string *values*, it doesn't drop keys). Edge case: a `bash_command` containing a secret could arrive partially `[REDACTED]` — then the regex simply doesn't match and the event stays `chat`. Acceptable; matches ticket intent.

### Flag semantics

`config.x.ingest.event_type_renormalization` — env-driven, default ON everywhere except production (`DB90_EVENT_TYPE_RENORMALIZATION` overrides). This is exactly the ticket's sketch, which is viable now precisely because the code runs in Rails (the earlier Temporal-activity design could not use it — the worker is a standalone non-Rails process). Production rollout = set `DB90_EVENT_TYPE_RENORMALIZATION=true` on the **Rails API** deployment (not the worker) after validation on staging.

### Verified schema facts

- `ToolEvent::EVENT_TYPES` (`packages/api/app/models/tool_event.rb:12`) already includes `commit`, `test`, `edit`.
- PG enum `public.event_type` (`packages/api/db/structure.sql:76-91`) already includes all targets. **No migration.**

### Files (expected diff)

| File | Action |
|------|--------|
| `packages/api/app/services/event_type_normalizer.rb` | NEW — pure rule engine |
| `packages/api/app/services/tool_events/upsert.rb` | UPDATE — `normalize_event_type!` step + flag guard |
| `packages/api/config/application.rb` | UPDATE — `config.x.ingest.event_type_renormalization` |
| `packages/api/spec/services/event_type_normalizer_spec.rb` | NEW — unit spec, all rules + boundaries |
| `packages/api/spec/services/tool_events/upsert_spec.rb` | UPDATE — re-tag + flag-off + passthrough cases |
| `packages/api/spec/requests/api/v1/ingest_spec.rb` | UPDATE — end-to-end Jira AC #1/#2 |

NOT touched: `temporal/**` (no activity, no workflow change, no worker registration), `docker-compose.yml`, routes/controllers, `swagger/v1/swagger.yaml` (request/response shapes unchanged), migrations.

### Testing requirements

- Real DB in request/service specs — no DB mocking (project rule). FactoryBot for org/user/tool-account setup; mirror existing `ingest_spec.rb` auth setup (ingest token authentication).
- The request spec relies on the fallback path: in test env `Temporal::Client.start_workflow` raises → controller rescues → `fallback_direct_insert` → `Upsert`. That's a *covered production path*, not a test artifact — assert on the persisted `ToolEvent` row.
- Run from `packages/api/` (Gemfile lives there).

### Git intelligence (recent commits)

Recent work is AIX-192 (`Promote model from metadata in ToolEvents::Upsert`, Claude transcript ingest, Cursor hook attribution) — `Upsert` was touched recently; rebase on current `develop` and keep the new step consistent with `promote_model_from_metadata!` style. No in-flight change conflicts with the normalizer surface.

### Branch / commit conventions

- Branch from `develop`: `feature/AIX-260-event-type-normalizer`
- Commits: `[AIX-260] <imperative subject>` (≤ 72 chars)
- Single PR; link this story file in the PR description.
- **Update the Jira ticket** (comment or description edit) to record the design change away from the Temporal activity, so the ticket and implementation don't contradict each other at review time.

### Project context reference

- `_bmad-output/project-context.md` — rules engaged: Temporal only for durable multi-step orchestration (this is why the Temporal design was rejected); keep multi-step logic in `app/services/` (normalizer lands there); no DB mocking in request specs; Swagger untouched because no route/shape changes; RuboCop before done.

### References

- `packages/api/app/services/tool_events/upsert.rb` (primary modification target)
- `packages/api/app/controllers/api/v1/ingest_controller.rb` (fallback path + `permitted_params`)
- `packages/api/app/controllers/api/internal_controller.rb` (`create_tool_event` → Upsert)
- `packages/api/app/controllers/api/v1/telemetry_controller.rb:94` (second workflow entry point — why controller-level normalization was rejected)
- `temporal/activities/persistence_activity.rb` (`metadata_from_sanitized` — metadata survival on Temporal path)
- `packages/api/app/models/tool_event.rb:12` (EVENT_TYPES)
- `packages/api/db/structure.sql:76` (PG enum)
- `packages/api/spec/requests/api/v1/ingest_spec.rb` (request-spec pattern)
- `_bmad-output/implementation-artifacts/cursor-recent-commit-event-type.md` (T-01 client-side prior art)
- `_bmad-output/implementation-artifacts/tool-use-event-type-enum-sync.md` (enum-drift prior art — why AC 9 was verified)

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (`claude-fable-5`) via Claude Code, bmad-dev-story workflow.

### Debug Log References

- Local `bundle exec rspec` blocked by system Ruby 2.6 (no asdf/rbenv on host) — all test/lint runs executed via `docker compose exec api ...` per Makefile convention (`make test-api` / `make lint-api`).
- TDD red-green confirmed for both units: normalizer spec failed on missing constant before implementation; upsert spec failed on `event_type == "commit"` expectations before wiring `normalize_event_type!`.

### Completion Notes List

- `EventTypeNormalizer.derive(event_type:, metadata:)` — pure class-level rule engine, first-match-wins order exactly per AC 1 (source → git-commit bash → test-runner bash → edit tool). Returns `nil` for non-`chat`, blank metadata, or no match. String/symbol key access via private `fetch` helper; no input mutation (verified by frozen-hash spec).
- `ToolEvents::Upsert#call` pipeline is now `promote_model_from_metadata! → enrich_cost! → normalize_event_type! → create/upsert`. Flag guard is `renormalization_enabled?` — reads `DB90_EVENT_TYPE_RENORMALIZATION` from ENV directly (default ON outside production); on re-tag, metadata gains `renormalized_from`/`renormalized_by => "server_v1"` via merge (preserves `cost_source`). Advisory-lock dedupe flow and `MUTABLE_FIELDS` untouched — dedupe-update path covered by a regression spec proving re-sends never flip an existing row's type.
- **Deviation from AC 4 (approved by Kirill during dev):** the `config.x.ingest.event_type_renormalization` line in `application.rb` was implemented, then removed at Kirill's request — the ENV check moved into `Upsert#renormalization_enabled?`. Same env var, same default semantics; specs stub the flag via `stub_const("ENV", ...)` (existing ingest_spec idiom) instead of stubbing `config.x`.
- Request specs cover Jira AC #1/#2 end-to-end through `POST /api/v1/ingest/events` on the fallback-direct-insert path (Temporal stubbed to raise — a covered production path), real DB, no DB mocking.
- Verification: full API suite 2524 examples / 0 failures; `make lint-api` (RuboCop, 528 files) clean. No migrations, no controller/route/Temporal/Swagger changes (AC 9–10).
- Open questions from the story remain for Kirill: Jira design-decision comment on AIX-260, production rollout owner for the env flag, and whether a retroactive backfill follow-up is wanted under AIX-258.

### File List

- `packages/api/app/services/event_type_normalizer.rb` (new)
- `packages/api/app/services/tool_events/upsert.rb` (modified)
- `packages/api/spec/services/event_type_normalizer_spec.rb` (new)
- `packages/api/spec/services/tool_events/upsert_spec.rb` (modified)
- `packages/api/spec/requests/api/v1/ingest_spec.rb` (modified)
- `_bmad-output/implementation-artifacts/aix-260-normalize-event-type-activity.md` (modified — story tracking)

## Change Log

- 2026-06-12 — Story created from Jira AIX-260 with full codebase analysis (standalone artifact; no sprint-status.yaml in repo). Initial design: Temporal activity per ticket.
- 2026-06-12 — **Design revised per team decision (Kirill):** Temporal activity rejected as overkill for a pure transformation; normalization moved to `ToolEvents::Upsert` + `EventTypeNormalizer` service. Covers fallback and telemetry paths the activity design missed; makes the ticket's `config.x` flag and request-spec AC literally implementable.
- 2026-06-12 — **Implementation complete** on branch `feature/AIX-260-event-type-normalizer`: normalizer service + `Upsert` wiring + ENV-driven flag; 34 new unit examples, 8 new upsert examples, 2 new request examples. Full suite 2524/0, RuboCop clean. Status → review.
- 2026-06-12 — **Flag placement revised (Kirill):** removed the `config.x.ingest.event_type_renormalization` block from `application.rb`; `Upsert#renormalization_enabled?` now reads `DB90_EVENT_TYPE_RENORMALIZATION` directly. Full suite re-run 2524/0, RuboCop clean.
- 2026-06-12 — **Adversarial code review** (Blind Hunter / Edge Case Hunter / Acceptance Auditor): 2 decisions resolved (regexes stay per AC 1; forged provenance keys stripped), 4 patches applied (create-only normalization, reserved-key strip, type guards, boolean flag cast), 1 deferred (pre-existing wholesale metadata replacement on dedupe-update → deferred-work.md). Full suite 2535/0, RuboCop clean. Status → done.

## Open questions (saved for the end)

1. **Jira sync:** the ticket description still prescribes the Temporal activity. Update the description or drop a design-decision comment on AIX-260 before/with the PR? (Recommended: comment, linked from the PR.)
2. **Production rollout owner:** who flips `DB90_EVENT_TYPE_RENORMALIZATION=true` on the production Rails API after staging validation, and where is that deploy config tracked?
3. **Retroactive data:** pre-existing misclassified `chat` rows are untouched by this story. Is a backfill (cf. `aix-245-backfill-project-attribution.md` precedent) wanted as a follow-up under AIX-258?
