# Story: Metadata enrichment — jira_ticket, pr_number, pr_url, branch on every event (AIX-261)

Status: review

Completion note: Ultimate context engine analysis completed - comprehensive developer guide created. Design revised vs the Jira sketch following the AIX-260 precedent: pure extraction lives in `ToolEvents::Upsert`, I/O-bound PR correlation lives in a Sidekiq job — no Temporal activity.

Jira: [AIX-261](AIX-261) · Epic: [AIX-258](AIX-258) "Event-type expansion + metadata enrichment for CLI connectors" (T-04, Phase 1)

## Story

As a DB90 product user slicing AI-tool usage analytics,
I want every ingested event enriched with the Jira ticket, PR number/URL, and branch it relates to,
so that dashboards can break down cost and activity by ticket/epic/sprint and link straight to the PR — without joining external data.

## Design decision (supersedes the Jira sketch — do not re-litigate without team sign-off)

The Jira description prescribes a Temporal activity `enrich_metadata_activity.rb` "inserted between `NormalizeEventTypeActivity` and `PersistEventActivity`". **Neither anchor exists.** `NormalizeEventTypeActivity` was never built — AIX-260 (done) explicitly rejected the Temporal-activity design, and normalization lives in `ToolEvents::Upsert` (`packages/api/app/services/tool_events/upsert.rb`). The activity named `PersistEventActivity` is actually `PersistenceActivity`. The same reasoning from AIX-260 applies here, split by the nature of each enrichment:

| Enrichment | Nature | Where it goes | Why |
|---|---|---|---|
| `jira_ticket` extraction | Pure, deterministic, zero-I/O regex scan | `ToolEvents::Upsert` create branches, next to `normalize_event_type!` | Same idiom as AIX-260; covers ALL persistence paths (Temporal → internal API, `fallback_direct_insert`, telemetry) — a Temporal activity covers only one |
| PR correlation | External GitHub API call + cache | New **Sidekiq job** `PrCorrelationJob` enqueued after persist, calling `MetadataEnrichers::PrCorrelator` | Project rule: Sidekiq for normal async jobs, Temporal only for durable multi-step orchestration. A single cached HTTP lookup is not that. Must NOT run synchronously on the ingest hot path (latency + GitHub outage would block ingest) |

Second stale premise: **`GithubClient` does not exist.** GitHub API access goes through `Oauth::GithubProvider` (`packages/api/app/services/oauth/github_provider.rb`) — Faraday + `OrganizationConnector.access_token`, with `ensure_fresh_token!` refresh handling in `Oauth::BaseProvider`. The correlator extends this provider with a PR-by-commit lookup (GitHub endpoint `GET /repos/{owner}/{repo}/commits/{sha}/pulls`) instead of inventing a new client family.

Third correction: the Temporal worker (`temporal/workers/ingestion_worker.rb`) is a **standalone non-Rails process** — no ActiveRecord, no `Rails.cache`. The ticket's "6-hour cache (Redis)" is only literally implementable inside Rails, which the Sidekiq design gives us for free (`Rails.cache` is `redis_cache_store` in production, `config/environments/production.rb:45`).

Out of scope (same boundary as AIX-260): `ToolEvents::ConnectorUpsert` (webhook dedupe path) and `GithubSyncJob`-created commit events — connector-sync events already carry `pr_number` from PR webhooks where relevant; wiring `PrCorrelationJob` into the connector sync path is a possible follow-up under AIX-258, not this story.

## Acceptance Criteria

1. New pure-Ruby service `MetadataEnrichers::JiraTicketExtractor` at `packages/api/app/services/metadata_enrichers/jira_ticket_extractor.rb`:
   - Scans metadata keys `branch`, `branch_name`, `commit_message`, `bash_command`, `tool_input_summary` (in that priority order, first match wins) for the ticket pattern.
   - Pattern default `/\b[A-Z][A-Z0-9]*-\d+\b/i` source overridable via ENV `JIRA_TICKET_PATTERN` (per ticket; invalid regex in ENV → fall back to default, never raise on the ingest path).
   - Returns the first match **uppercased**, or `nil` when metadata is nil/empty/non-Hash or nothing matches.
   - Pure function: no DB, no mutation of inputs, string/symbol-key defensive (the `Upsert` `dig`-both idiom).
2. `ToolEvents::Upsert` stamps `metadata["jira_ticket"]` on the **create branches only** (both the locked and direct-create paths, exactly like `normalize_event_type!`):
   - Only when the incoming metadata does **not** already carry a non-blank `jira_ticket` (client-supplied value wins — future CLIs may send it directly).
   - Dedupe-update path (session re-send) never stamps — mirrors the AIX-260 review fix.
   - All other attributes untouched.
3. New service `MetadataEnrichers::PrCorrelator` at `packages/api/app/services/metadata_enrichers/pr_correlator.rb`:
   - Input: `commit_hash:`, `repository:` (a `Repository` record). Resolves the GitHub connector from `repository.organization_connector` and calls a new `Oauth::GithubProvider#fetch_pull_requests_for_commit(full_name, sha)` (`GET /repos/{owner}/{repo}/commits/{sha}/pulls`).
   - Returns `{ pr_number:, pr_url:, pr_state: }` for the first associated PR, or `{ pr_lookup_status: "not_found" }` when the API returns an empty list.
   - **6-hour `Rails.cache.fetch`** keyed `"pr_correlation/#{repository.id}/#{commit_hash}"` — caches both hits AND `not_found` (negative caching is what satisfies the ticket's API-call budget AC).
   - On Faraday/auth errors: raise (let Sidekiq retry) — do NOT cache errors.
4. New Sidekiq job `PrCorrelationJob` at `packages/api/app/jobs/pr_correlation_job.rb`:
   - Enqueued from `ToolEvents::Upsert` after a successful **create** when: feature flag on, `event_type == "commit"`, and metadata has a `commit_hash` (or `sha`) key.
   - The job re-loads the event, resolves the repository (in order: `event.repository_id` → repository matching the event's `project.repositories` → match by `Project.git_remote_path(project.git_remote_url)` against `Repository.full_name`). No resolvable repo with a GitHub connector → merge `{ "pr_lookup_status" => "no_repo_link" }` and stop (no API call, no retry).
   - On correlator result: `event.update!(metadata: event.metadata.merge(result.stringify_keys))`.
   - Sidekiq default retries are fine; job must be idempotent (cache + merge make it so).
5. Feature flag for the GitHub-calling half, mirroring the AIX-260 idiom (`Upsert#renormalization_enabled?` style): ENV `DB90_PR_CORRELATION`, `ActiveModel::Type::Boolean` cast, default ON outside production. Flag off → job never enqueued. Jira extraction has **no flag** — it is pure and harmless.
6. Server-stamped PR keys cannot be forged by clients: extend `Upsert::RESERVED_METADATA_KEYS` with `pr_number pr_url pr_state pr_lookup_status` so they are stripped from incoming CLI metadata (same anti-forgery rationale as `renormalized_*` in AIX-260; a forged `pr_url` is a malicious link rendered in the UI). `jira_ticket` is NOT reserved (AC 2 allows client supply).
7. Serializer: add to the shared concern `packages/api/app/serializers/concerns/tool_event_attributes.rb` (so list and detail endpoints both gain them):
   - `jira_ticket` → `metadata["jira_ticket"]`
   - `pr_number` → `metadata["pr_number"]`
   - `pr_url` → `metadata["pr_url"]`
   - `branch` → `metadata["branch"] || metadata["branch_name"]`
   All nullable; camelCased by `BaseSerializer` to `jiraTicket`/`prNumber`/`prUrl`/`branch`.
8. Swagger (`packages/api/swagger/v1/swagger.yaml`): add `jiraTicket` (string, nullable), `prNumber` (integer, nullable), `prUrl` (string, nullable), `branch` (string, nullable) to the `ToolEvent` schema (~line 6243; `ToolEventDetail` inherits via `allOf`). No route/path changes.
9. End-to-end (Jira AC #1): `POST /api/v1/ingest/events` with a `commit` event carrying `metadata.branch_name = "feature/AIX-157-foo"` → persisted row has `metadata["jira_ticket"] == "AIX-157"`, and `GET /api/v1/organizations/:org_id/events/:id` returns `jiraTicket`, `branch` in JSON (request spec, real DB, fallback-direct-insert path as in AIX-260).
10. Unit/job specs cover: extractor key priority + uppercasing + lowercase input (`aix-12` → `AIX-12`) + ENV pattern override + invalid-ENV-regex fallback + non-Hash metadata; correlator cache hit/miss/negative-cache (WebMock, no live HTTP) + error propagation; Upsert stamping on create / not on dedupe-update / client-supplied `jira_ticket` preserved / reserved `pr_*` stripped; job repo-resolution fallback chain + flag-off no-enqueue.
11. GitHub API call budget (Jira AC #4): correlator spec proves a second `call` for the same `(repository, commit_hash)` within TTL performs zero HTTP requests (assert via WebMock request count).
12. No Temporal changes (`temporal/**` untouched), no route/controller changes, no migrations (metadata is JSONB — verified, nothing schema-level needed). RuboCop passes (`make lint-api`).

## Tasks / Subtasks

- [x] Create `packages/api/app/services/metadata_enrichers/jira_ticket_extractor.rb`. (AC: 1)
  - [x] `MetadataEnrichers::JiraTicketExtractor.extract(metadata) -> String | nil`; `SCAN_KEYS = %w[branch branch_name commit_message bash_command tool_input_summary].freeze`.
  - [x] Pattern resolution: `ENV["JIRA_TICKET_PATTERN"]` → `Regexp.new(..., Regexp::IGNORECASE)` rescue `RegexpError` → default. Resolve per-call (cheap; avoids stale memoization in tests).
  - [x] Only scan `String` values (type-guard like `EventTypeNormalizer` post-review).
- [x] Wire extraction into `ToolEvents::Upsert`. (AC: 2, 6)
  - [x] `extract_jira_ticket!` called on both create branches next to `normalize_event_type!` (NOT in `#call`'s shared pipeline — dedupe-update must not stamp; see AIX-260 review finding #3).
  - [x] Skip when `metadata["jira_ticket"] || metadata[:jira_ticket]` present and non-blank.
  - [x] Merge with string key: `@attributes[:metadata] = (@attributes[:metadata] || {}).merge("jira_ticket" => ticket)`.
  - [x] Extend `RESERVED_METADATA_KEYS` with the four `pr_*` keys (string + symbol stripping already handled by `strip_reserved_metadata!`).
- [x] Add `Oauth::GithubProvider#fetch_pull_requests_for_commit(full_name, sha)`. (AC: 3)
  - [x] `ensure_fresh_token!` first (existing `fetch_commits` idiom, `github_provider.rb:46`); GET `#{API_URL}/repos/#{owner}/#{repo}/commits/#{sha}/pulls`; return parsed array on success, raise `Oauth::GithubApiError` (or reuse an existing error class) on non-success so the job retries.
- [x] Create `packages/api/app/services/metadata_enrichers/pr_correlator.rb`. (AC: 3, 11)
  - [x] `Rails.cache.fetch("pr_correlation/#{repository.id}/#{commit_hash}", expires_in: 6.hours)` wrapping the provider call; map first PR → `{ pr_number: n, pr_url: html_url, pr_state: state }`; empty → `{ pr_lookup_status: "not_found" }`.
  - [x] Do not swallow provider errors inside the cache block (an exception aborts `fetch` without caching — verify in spec).
- [x] Create `packages/api/app/jobs/pr_correlation_job.rb`. (AC: 4, 5)
  - [x] `queue_as :default` (match existing jobs in `app/jobs/`); `perform(tool_event_id)`; discard on `ActiveRecord::RecordNotFound`.
  - [x] Repo-resolution chain per AC 4; `Project.git_remote_path` already exists (`app/models/project.rb:69`).
  - [x] Skip (stamp `no_repo_link`) when repository has no `organization_connector` or connector isn't `github`.
  - [x] Enqueue site in `Upsert`: after successful create, guard `pr_correlation_enabled?` (ENV `DB90_PR_CORRELATION`, Boolean-cast, default ON outside production) + `event_type == "commit"` + commit hash present (`commit_hash` or `sha`, string/symbol).
- [x] Serializer + Swagger. (AC: 7, 8)
  - [x] Four attributes in `tool_event_attributes.rb` following the existing `metadata&.dig(...)` style.
  - [x] `swagger.yaml` `ToolEvent` schema: four nullable properties, NOT added to `required`.
- [x] Specs. (AC: 9-11)
  - [x] `spec/services/metadata_enrichers/jira_ticket_extractor_spec.rb` — pure unit, no DB.
  - [x] `spec/services/metadata_enrichers/pr_correlator_spec.rb` — WebMock; wrap examples needing real caching in `Rails.cache = ActiveSupport::Cache::MemoryStore.new` setup (test default is `:null_store` — check `config/environments/test.rb` and follow any existing cache-spec idiom, e.g. in rate-limiter specs).
  - [x] `spec/jobs/pr_correlation_job_spec.rb` — resolution chain, metadata merge, no_repo_link, flag semantics.
  - [x] Extend `spec/services/tool_events/upsert_spec.rb` — stamp on create, no stamp on dedupe-update, client value preserved, `pr_*` stripped, enqueue assertion (`have_enqueued_job` / Sidekiq testing per existing job-spec idiom).
  - [x] Extend `spec/requests/api/v1/ingest_spec.rb` + `spec/requests/api/v1/events_spec.rb` (find exact events request-spec path) — AC 9 end-to-end. Also extended `spec/serializers/concerns/tool_event_attributes_spec.rb` (project rule: serializer changes need serializer specs).
- [x] Verify. (AC: 12)
  - [x] Via `docker compose exec -T api bundle exec rspec` (host Ruby is 2.6, as in AIX-260): full run of `spec/requests/api/v1/ spec/services/ spec/jobs/ spec/serializers/` — 1611 examples, 0 failures.
  - [x] RuboCop on all 14 changed files — no offenses.

## Dev Notes

### Business context (from Jira)

Phase 1, highest-value addition for "make metrics make sense": once events carry the Jira ticket, every dashboard can slice by ticket/epic/sprint without joining external data. Branch naming `feature/AIX-XX-...` and commit format `[AIX-XX] …` are already enforced repo-wide by CLAUDE.md, so the regex net catches real traffic immediately.

### Current state of files being modified

**`packages/api/app/services/tool_events/upsert.rb`** (post-AIX-260, including all four review patches): `#call` = `strip_reserved_metadata!` → `promote_model_from_metadata!` → `enrich_cost!` → branch on `session_id` (advisory-lock dedupe vs direct create); `normalize_event_type!` runs **only on the two create branches** (upsert.rb:48, :148). `RESERVED_METADATA_KEYS = %w[renormalized_from renormalized_by]` stripped unconditionally (upsert.rb:27). `MUTABLE_FIELDS` includes `metadata` (wholesale replace on re-send — known deferred issue, see below). Flag idiom: `renormalization_enabled?` (upsert.rb:127-130) — copy this exactly for `pr_correlation_enabled?`.

**What must be preserved:** advisory-lock flow and `MUTABLE_FIELDS` untouched; `cost_source` / `renormalized_*` stamps must survive the new merges (always `.merge`, never replace); non-commit events byte-identical (no `jira_ticket` key when nothing matched — stamp only on non-nil extraction); dedupe-update path stamps nothing (regression spec exists for `renormalized_*`, add the twin for `jira_ticket`).

**`packages/api/app/serializers/concerns/tool_event_attributes.rb`** — shared by `ToolEventSerializer` (list) and `ToolEventDetailSerializer` (show). Existing idiom for metadata-backed attributes: `event.metadata&.dig("correlation_method")` (line 35). Adding here means BOTH endpoints gain the fields — Swagger `ToolEvent` schema (used by list at swagger.yaml:3753/3907/3949 and inherited by `ToolEventDetail` via allOf at :6344) is the single place to document them.

**`packages/api/app/services/oauth/github_provider.rb`** — Faraday `http_client` with connector bearer token (BaseProvider:173-179), token refresh via `ensure_fresh_token!` (BaseProvider:157-167). Scopes already include `repo` (github_provider.rb:97) — sufficient for the commit-pulls endpoint on private repos. Note: `GET /repos/{owner}/{repo}/commits/{sha}/pulls` is plain REST, no preview header needed (was `groot-preview` years ago — long since GA).

### Known sharp edges (read before coding)

1. **Dedupe metadata wipe (pre-existing, deferred from AIX-260):** a same-session re-send wholesale-replaces `metadata` via `MUTABLE_FIELDS`, which would wipe a previously stamped `jira_ticket`/`pr_*`. For THIS story's traffic the blast radius is small: commit events (Cursor `recent_commit` path) carry no `session_id` — **verified** in `packages/tools/aixle-insights/src/cursor-payload-contract.ts:41-50` (METADATA_COMMIT_KEYS = base keys incl. `cursor_session_id` + `source, commit_hash, commit_message, repo_name, branch_name, ai_percentage`; `session_id` exists only in the transcript key set). Commit events therefore always take the direct-create branch and the wipe can't hit them. Do not fix the wholesale-replace here — it stays in `deferred-work.md`.
2. **`PersistenceActivity` metadata survival:** the Temporal path's `metadata_from_sanitized` overlays sanitized-payload metadata — `branch_name`, `commit_message`, `commit_hash`, `bash_command` keys survive sanitization (values may be `[REDACTED]`; a redacted value simply won't match the regex — acceptable, same posture as AIX-260).
3. **Test cache store:** `Rails.cache` in test env is likely `:null_store` — `fetch` then never caches and the negative-cache spec (AC 11) silently passes for the wrong reason. Use a `MemoryStore` swap in the correlator spec (and restore in ensure/around).
4. **`pr_number` type:** GitHub returns integer; keep it an integer through metadata → serializer → swagger (`type: integer`). JSONB preserves JSON numbers; don't `to_s` it.
5. **Repository → connector:** `Repository belongs_to :organization_connector` (required). The chain breaks for projects with `git_remote_url` but no synced Repository row — that's the `no_repo_link` outcome, by design. Don't try to call GitHub unauthenticated.
6. **GithubSyncJob commit events use `metadata.sha`** (github_sync_job.rb:185), CLI recent-commit uses `commit_hash` — the enqueue guard and the job read both keys.

### Flag semantics

`DB90_PR_CORRELATION` — env-driven on the **Rails API** deployment (job enqueue + Sidekiq both run in Rails), default ON outside production, production opts in after staging validation. Exact same casting/default pattern as `renormalization_enabled?` (AIX-260 final form — ENV read in the service, NOT `config.x` in application.rb; that placement was explicitly reverted by Kirill last story, don't reintroduce it). `JIRA_TICKET_PATTERN` is a tuning knob, not a flag — absent means default pattern.

### Verified facts (don't re-derive)

- `NormalizeEventTypeActivity` / `EnrichMetadataActivity` do not exist; Temporal activities are Fetch/GetPolicy/Classification/Sanitization/Persistence/Broadcast/Alert (worker: `temporal/workers/ingestion_worker.rb:28-37`).
- `GithubClient` does not exist; no commit→PR mapping exists anywhere in the codebase today.
- `GET /api/v1/organizations/:organization_id/events/:id` exists (`app/controllers/api/v1/events_controller.rb:23-27`, `ToolEventDetailSerializer`, metadata JSONB fully exposed).
- `Rails.cache` = `redis_cache_store` in production (`config/environments/production.rb:45`); existing TTL idioms in `ingest_rate_limiter.rb`, `cost_alert_job.rb`.
- `Project.git_remote_path` exists (`app/models/project.rb:69-72`); `Repository` has `full_name` + `organization_connector` (`app/models/repository.rb:2-4`).
- Metadata JSONB needs no migration for new keys.

### Files (expected diff)

| File | Action |
|------|--------|
| `packages/api/app/services/metadata_enrichers/jira_ticket_extractor.rb` | NEW — pure extractor |
| `packages/api/app/services/metadata_enrichers/pr_correlator.rb` | NEW — cached GitHub lookup |
| `packages/api/app/jobs/pr_correlation_job.rb` | NEW — Sidekiq job |
| `packages/api/app/services/oauth/github_provider.rb` | UPDATE — `fetch_pull_requests_for_commit` |
| `packages/api/app/services/tool_events/upsert.rb` | UPDATE — `extract_jira_ticket!`, reserved keys, job enqueue |
| `packages/api/app/serializers/concerns/tool_event_attributes.rb` | UPDATE — 4 attributes |
| `packages/api/swagger/v1/swagger.yaml` | UPDATE — 4 nullable props on ToolEvent |
| `packages/api/spec/services/metadata_enrichers/jira_ticket_extractor_spec.rb` | NEW |
| `packages/api/spec/services/metadata_enrichers/pr_correlator_spec.rb` | NEW |
| `packages/api/spec/jobs/pr_correlation_job_spec.rb` | NEW |
| `packages/api/spec/services/tool_events/upsert_spec.rb` | UPDATE |
| `packages/api/spec/requests/api/v1/ingest_spec.rb` | UPDATE |
| `packages/api/spec/requests/api/v1/events_spec.rb` | UPDATE |

NOT touched: `temporal/**`, routes/controllers, migrations, `ToolEvents::ConnectorUpsert`, `GithubSyncJob`, frontend.

### Testing requirements

- Real DB in request/service specs, no DB mocking (project rule). WebMock for GitHub HTTP (already a dependency, used with VCR elsewhere).
- Request specs ride the fallback-direct-insert path (Temporal raises in test env) — a covered production path, per AIX-260 precedent.
- Job specs: follow the existing `spec/jobs/` idioms (e.g. `github_sync_job` specs) for enqueue/perform style.
- Run from `packages/api/`; if host Ruby is broken, `docker compose exec api ...` / `make test-api` (see AIX-260 debug log).

### Previous story intelligence (AIX-260 — direct predecessor, same epic)

- Temporal-activity designs from this epic's tickets are consistently stale — `Upsert` is the agreed chokepoint for pure enrichment; the team will reject a Temporal proposal again.
- Review will probe: forged metadata keys (hence AC 6 pre-empts it), dedupe-update contamination (hence create-branch-only stamping), type guards on metadata values (hence String-only scanning), and flag string-casting (hence Boolean cast from the start).
- Kirill prefers ENV reads in the service over `config.x` blocks in `application.rb`.
- Adversarial review happens after dev; budget for a findings round.

### Git intelligence

Recent `develop` work: AIX-260 normalizer (touches `upsert.rb` — rebase carefully, the create-branch placement of `normalize_event_type!` is load-bearing), aixle-insights 0.1.1 release (tools only, no API surface conflict). No in-flight branches conflict with `metadata_enrichers/`.

### Branch / commit conventions

- Branch from `develop`: `feature/AIX-261-metadata-enrichment`
- Commits: `[AIX-261] <imperative subject>` (≤ 72 chars)
- Single PR; link this story file in the PR description.
- **Update the Jira ticket** with a design-decision comment (Temporal activity → Upsert + Sidekiq; `GithubClient` → `Oauth::GithubProvider`) so ticket and implementation don't contradict at review time — same hygiene as AIX-260.

### Project context reference

`_bmad-output/project-context.md` — rules engaged: Sidekiq for normal async jobs / Temporal only for durable orchestration (drives the whole design); Swagger sync in the same change (hard failure otherwise); no DB mocking; no new dependency families (reuse Faraday/Oauth provider, NOT octokit); RuboCop before done.

### References

- `packages/api/app/services/tool_events/upsert.rb` (primary modification target — read fully first)
- `packages/api/app/services/event_type_normalizer.rb` (the pattern to mirror for the extractor)
- `packages/api/app/services/oauth/github_provider.rb` + `oauth/base_provider.rb` (HTTP/token idioms)
- `packages/api/app/jobs/github_sync_job.rb` (job style, PR metadata shape `pr_number`/`pr_state`)
- `packages/api/app/serializers/concerns/tool_event_attributes.rb` (serializer target)
- `packages/api/swagger/v1/swagger.yaml:6243` (ToolEvent schema)
- `packages/api/app/models/project.rb:48-72`, `app/models/repository.rb` (repo resolution)
- `packages/tools/aixle-insights/src/cursor-payload-contract.ts:41-49` (recent-commit metadata keys actually sent)
- `temporal/activities/persistence_activity.rb` (metadata survival on Temporal path)
- `_bmad-output/implementation-artifacts/aix-260-normalize-event-type-activity.md` (predecessor — design precedent + review findings)
- `_bmad-output/implementation-artifacts/deferred-work.md` (dedupe metadata-replace issue — do not fix here)

## Dev Agent Record

### Implementation Plan

Implemented in story-task order, red-green per task, all runs via `docker compose exec -T api` (host Ruby is system 2.6, same as AIX-260):

1. **`JiraTicketExtractor`** — class-method pure function mirroring `EventTypeNormalizer`: `SCAN_KEYS` priority order, String-only value scanning, per-call pattern resolution (`ENV["JIRA_TICKET_PATTERN"]` → `Regexp.new(..., IGNORECASE)` rescue `RegexpError` → default `/\b[A-Z][A-Z0-9]*-\d+\b/i`), first match uppercased.
2. **`Upsert` wiring** — `extract_jira_ticket!` placed after `normalize_event_type!` on both create branches (so a re-tag and a ticket stamp coexist); skips when client supplied a non-blank `jira_ticket` (string or symbol key); `RESERVED_METADATA_KEYS` extended with `pr_number pr_url pr_state pr_lookup_status`.
3. **`Oauth::GithubProvider#fetch_pull_requests_for_commit`** — `ensure_fresh_token!` then `GET /repos/{owner}/{repo}/commits/{sha}/pulls`; raises new `Oauth::GithubApiError` (defined next to the class, sibling of the existing `Oauth::*Error` constants) on non-success; `ArgumentError` on malformed `full_name` before any HTTP.
4. **`PrCorrelator`** — `Rails.cache.fetch("pr_correlation/#{repository.id}/#{commit_hash}", expires_in: 6.hours)`; maps first PR to `{ pr_number:, pr_url:, pr_state: }` (integer `pr_number` preserved), empty list → `{ pr_lookup_status: "not_found" }` (negative-cached); provider errors propagate uncached (verified by spec asserting a 502 is retried with a second HTTP call).
5. **`PrCorrelationJob`** — ActiveJob (`ApplicationJob`, `queue_as :default`, `discard_on ActiveRecord::RecordNotFound`); commit hash read from `commit_hash` then `sha`; repo resolution chain: `event.repository_id` → `project.repositories.first` → `Repository.full_name` matched (case-insensitively) against `Project.git_remote_path` within the event's organization; non-GitHub/unresolvable → stamp `pr_lookup_status: "no_repo_link"`, no API call. Enqueue site in `Upsert#enqueue_pr_correlation` on both create branches, guarded by `pr_correlation_enabled?` (ENV `DB90_PR_CORRELATION`, Boolean cast, default ON outside production — exact `renormalization_enabled?` idiom).
6. **Serializer + Swagger** — four attributes in the shared `ToolEventAttributes` concern (`branch` falls back `branch` → `branch_name`); four nullable properties on the `ToolEvent` schema (`prNumber` is `type: integer`), not in `required`.

### Debug Log

- Host `bundle exec` fails (system Ruby 2.6 / bundler mismatch) — all tests and RuboCop run inside the `api` container, as documented in the AIX-260 debug log.
- AIX-260 is not yet merged to `develop` (PR open); this story's branch is **stacked on `feature/AIX-260-event-type-normalizer`** because `upsert.rb` placement of `extract_jira_ticket!` depends on `normalize_event_type!`'s create-branch structure.
- Test env cache is `:null_store` (confirmed `config/environments/test.rb:23`) — correlator spec swaps in `ActiveSupport::Cache::MemoryStore` via `around` so the AC-11 negative-cache assertions are real.
- `have_enqueued_job` works against the default ActiveJob test adapter; `PrCorrelationJob` was made an `ApplicationJob` (ActiveJob) rather than a native `Sidekiq::Job` since the story spec called for `queue_as`/`discard_on` semantics and both styles coexist in `app/jobs/`.

### Completion Notes

- All 12 ACs implemented and covered by specs; full regression on `spec/requests/api/v1/ spec/services/ spec/jobs/ spec/serializers/` — **1611 examples, 0 failures**; RuboCop on all 14 changed files — no offenses; `swagger.yaml` parses.
- AC 9 end-to-end rides the fallback-direct-insert path (Temporal stubbed to fail), same as the AIX-260 precedent block in `ingest_spec.rb`.
- AC 11 proven via WebMock request counting: second correlator call within TTL performs zero HTTP requests; `not_found` is also negative-cached; errors are not cached.
- Out of scope honored: `temporal/**`, routes/controllers, migrations, `ToolEvents::ConnectorUpsert`, `GithubSyncJob`, frontend untouched; dedupe metadata-wipe issue left in `deferred-work.md`.
- Open questions 1–5 at the bottom of this file remain for the team (design sign-off, default pattern generalization, Jira ticket comment about the design revision still to be posted).

## File List

- `packages/api/app/services/metadata_enrichers/jira_ticket_extractor.rb` (new)
- `packages/api/app/services/metadata_enrichers/pr_correlator.rb` (new)
- `packages/api/app/jobs/pr_correlation_job.rb` (new)
- `packages/api/app/services/oauth/github_provider.rb` (modified — `Oauth::GithubApiError`, `#fetch_pull_requests_for_commit`)
- `packages/api/app/services/tool_events/upsert.rb` (modified — `extract_jira_ticket!`, reserved `pr_*` keys, `enqueue_pr_correlation` + flag)
- `packages/api/app/serializers/concerns/tool_event_attributes.rb` (modified — `jira_ticket`, `pr_number`, `pr_url`, `branch`)
- `packages/api/swagger/v1/swagger.yaml` (modified — 4 nullable props on `ToolEvent`)
- `packages/api/spec/services/metadata_enrichers/jira_ticket_extractor_spec.rb` (new)
- `packages/api/spec/services/metadata_enrichers/pr_correlator_spec.rb` (new)
- `packages/api/spec/jobs/pr_correlation_job_spec.rb` (new)
- `packages/api/spec/services/oauth/github_provider_spec.rb` (modified)
- `packages/api/spec/services/tool_events/upsert_spec.rb` (modified)
- `packages/api/spec/serializers/concerns/tool_event_attributes_spec.rb` (modified)
- `packages/api/spec/requests/api/v1/ingest_spec.rb` (modified)
- `packages/api/spec/requests/api/v1/events_spec.rb` (modified)

## Change Log

- 2026-06-12 — Story created from Jira AIX-261 with full codebase analysis (standalone artifact; no sprint-status.yaml in repo). Design revised vs the Jira sketch per AIX-260 precedent: no Temporal activity (anchors don't exist), jira extraction in `Upsert`, PR correlation as Sidekiq job over `Oauth::GithubProvider` (no `GithubClient` exists), 6h `Rails.cache` with negative caching.
- 2026-06-12 — Implementation complete on `feature/AIX-261-metadata-enrichment` (stacked on AIX-260). All tasks done, 1611-example regression green, RuboCop clean. Status → review.

## Open questions (saved for the end)

1. **Design sign-off:** the Upsert + Sidekiq split follows the AIX-260 precedent but is this story's call, not yet team-ratified. Confirm before dev starts (and drop the Jira comment).
2. **Default ticket pattern:** ticket sketch says `AIX-\d+`; this story generalizes the default to `[A-Z][A-Z0-9]*-\d+` (any Jira-style key) since the platform is multi-tenant and `JIRA_TICKET_PATTERN` is per-deployment, not per-org. OK, or keep the literal `AIX-\d+` default?
3. **Reserved `pr_*` keys vs connector paths:** `ConnectorUpsert`/`GithubSyncJob` legitimately write `pr_number` into metadata for PR webhook events — those paths bypass `Upsert`, so the strip doesn't affect them. Confirm no CLI connector legitimately sends `pr_*` today (none found in `aixle-insights` contracts).
4. **Connector-sync follow-up:** wire `PrCorrelationJob` into `GithubSyncJob` commit events as a sibling task under AIX-258?
5. **Per-org pattern:** longer term, should the ticket pattern live on `Organization` settings instead of a global ENV? (Out of scope here.)
