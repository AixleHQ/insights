# Story AIX-245: Retroactive project attribution for historical tool_events

Status: done

**Completion note:** Implemented `Backfills::ProjectAttributionBackfill` + `db90:backfill_project_attribution` rake task; RSpec + full suite green in Docker.

## Story

As a DB90 operator,
I want a conservative rake backfill that sets `project_id` on historical `timeseries.tool_events` rows where it is safe to infer the project from org-scoped project membership,
so that project cards and project-scoped stats show non-zero historical activity for single-project users after AIX-245-style ingest attribution is deployed.

## Acceptance Criteria

1. Running `rails db90:backfill_project_attribution` (from `packages/api/`) attributes **all unambiguous** events: for each organization, each user who belongs to **exactly one** project in that org (via `project_memberships` → `projects.organization_id`) gets `UPDATE` on their `tool_events` where `organization_id`, `user_id` match, `project_id IS NULL`, setting `project_id` to that sole project.
2. Users with **more than one** project in the org: their events with `project_id IS NULL` remain `NULL` (no guessing).
3. Users with **zero** projects in the org: no updates (events stay `NULL`).
4. **Idempotent:** re-running skips rows already attributed (`project_id IS NULL` in `WHERE`).
5. **Dry-run:** when the task is invoked with the rake argument `dry_run` (e.g. `rails db90:backfill_project_attribution[dry_run]` from `packages/api/`), it prints counts and per-user/org summaries of what **would** be updated, without writing. **`ENV["DRY_RUN"]` is not used** — same pattern as other `db90:*` tasks that take `[dry_run]`.
6. **Batched writes:** each live `UPDATE` affects at most **1000** rows per iteration (loop until no rows match), using `update_all` with a stable `WHERE` clause — not per-row Ruby updates — to reduce lock pressure on the TimescaleDB hypertable.
7. **Logging:** for each attributed batch (or aggregated per user/project), log how many events were attributed to project X for user Y (use `Rails.logger` and/or `puts` consistent with other `db90:*` tasks in `db90.rake`).
8. **Visibility for ambiguous users:** for users with `>1` project in the org, log the count of events that remain unattributed (`project_id IS NULL` for that user+org) for operational visibility.

## Tasks / Subtasks

- [x] **Membership resolution** (AC: 1–3)
  - [x] For each `Organization`, build the set of users with exactly one distinct `project_id` under that org: `ProjectMembership.joins(:project).where(projects: { organization_id: org.id })`, group by `user_id`, `HAVING COUNT(DISTINCT project_id) = 1` (or equivalent in Ruby after a single SQL query — prefer one query per org to avoid N+1).
  - [x] Exclude `user_id` NULL on `tool_events` from attribution scope (events with no user cannot be mapped by membership); document this explicitly in task output if any such rows exist for targeted users.
- [x] **Backfill loop** (AC: 1, 4, 6, 7)
  - [x] For each `(organization_id, user_id, project_id)` tuple from the unambiguous set, loop: `n = ToolEvent.where(organization_id:, user_id:, project_id: nil).limit(1000).update_all(project_id:)` — **verify** on Rails 8.1 that `limit` is honored with `update_all`; if not, use `where(id: subquery.select(:id))` pattern with `LIMIT 1000` inside the subquery (composite PK table still keyed by `id` UUID).
  - [x] Accumulate counts; log per user/project and running totals.
- [x] **Ambiguous users** (AC: 2, 8)
  - [x] For users with `>1` project in the org, `count` `ToolEvent` where `organization_id`, `user_id`, `project_id: nil` and log (no `UPDATE`).
- [x] **Dry-run** (AC: 5)
  - [x] If the rake task argument is `dry_run` (see `db90.rake`, `args[:dry_run].to_s.strip.downcase == "dry_run"`), run the same enumeration and print counts / sample lines; never call `update_all` with writes.
- [x] **File / namespace** (AC: 1)
  - [x] Implement in `packages/api/lib/tasks/db90.rake` under `namespace :db90`, task name `backfill_project_attribution`, with a `desc` documenting usage, idempotency, Timescale batching rationale, and dry-run via `...[dry_run]` only (no `ENV["DRY_RUN"]`).
- [x] **Verification** (recommended, not in original AC list)
  - [x] From `packages/api/`: `bundle exec rubocop packages/api/lib/tasks/db90.rake`
  - [x] Optional: lightweight RSpec that loads the task file and invokes the task body in dry-run with factories — only if a fast pattern exists; otherwise manual staging verification with SQL `COUNT(*)` before/after.

### Review Findings

- [x] [Review][Decision] Подтвердить продуктовый компромисс из Open Q1… — **решено 2026-05-22:** D1:1 — оставляем как в спеке (вся история по текущему единственному членству в орг.).
- [x] [Review][Decision] Учитывать ли только активные проекты… — **решено 2026-05-22:** D2:2 — **не** фильтровать по `is_active`; неактивный проект может быть единственным и получить атрибуцию (явное принятие риска).

- [x] [Review][Patch] Синхронизировать `desc` rake-задачи с реализацией… — **применено 2026-05-22.**
- [x] [Review][Patch] Ужесточить батч-UPDATE и защиту от зацикливания… — **применено 2026-05-22** (`where(id: ids, project_id: nil)`, `break if updated.zero?`, счётчик `@events_updated_total`).
- [x] [Review][Patch] (Опционально AC7) Добавить итоговую сводку… — **применено 2026-05-22** (возврат `summary_stats` из `run`, сводка в rake).

- [x] [Review][Defer] Массовый `update_all` обходит валидации и колбэки модели — осознанный компромисс для гигиенской таблицы; не регрессия от патча. [`project_attribution_backfill.rb`] — deferred, pre-existing pattern choice.
- [x] [Review][Defer] Timescale: обновление строк в сжатых чанках может требовать декомпрессии — зона эксплуатации/runbook, не покрывается этим диффом. — deferred, pre-existing ops concern.
- [x] [Review][Defer] Частичное выполнение при падении процесса: идемпотентность по `project_id IS NULL` позволяет безопасно перезапускать; отдельный checkpoint по организации в спеке не требовался. — deferred, pre-existing acceptable ops model.
- [x] [Review][Defer] `dry_run` делает много `COUNT` по парам пользователь/проект — стоимость dry-run может сильно отличаться от live; приемлемо для операторской проверки. — deferred, not introduced as defect.

## Dev Notes

### Business context

All events ingested **before** `project_id` is reliably set at ingest time (AIX-245) have `project_id = NULL`. `AttributionJob` / `Ai::CorrelationService` addresses **user** correlation, not project. Without this backfill, **project-scoped** dashboards stay at zero for all historical activity.

### Conservative rules (do not violate)

- **Single-project users only:** attribute all their `NULL` `project_id` events for that org to their only project.
- **Multi-project users:** never set `project_id` from membership alone; future enrichment may use git remote metadata — out of scope here.

### Architecture compliance

- **Model:** `ToolEvent` uses `self.table_name = "timeseries.tool_events"` and `belongs_to :project, optional: true` — updates must remain valid FKs to `projects(id)`.
- **Hypertable:** Table is a Timescale hypertable on `occurred_at` with compression/retention policies; favor batched `UPDATE` with narrow `WHERE` (`organization_id`, `user_id`, `project_id IS NULL`) and modest batch size (1000) to limit chunk lock duration.
- **No controller/route/swagger:** rake-only change — **do not** edit `swagger.yaml`.
- **Patterns:** Mirror style of existing `db90:*` tasks in `db90.rake` (`puts` prefixes, `frozen_string_literal`, clear `desc`). Existing `backfill_event_costs` uses **per-row** `find_in_batches` + `update_columns` — **this story explicitly requires** `update_all` + batching for hot-table safety (different pattern, intentional).

### Technical requirements

1. **Scope joins:** `ProjectMembership` → `project` → filter `projects.organization_id == organization.id`. Do not confuse org-level `OrganizationMembership` with project membership; this backfill is **project_membership**-based only.
2. **Query safety:** Use `update_all(project_id:)` only; do not load full row objects for updates. Do not touch `repository_id` in this task.
3. **Users with NULL `user_id`:** Skip — no membership key; optionally log org-level count once.
4. **Dry-run detection:** only the rake task argument `dry_run` (e.g. `rails db90:backfill_project_attribution[dry_run]`). The service receives `dry_run:` from the task; do **not** read `ENV["DRY_RUN"]` — matches sibling `db90:*` tasks and avoids operators assuming `DRY_RUN=true` triggers dry-run while the task still writes.
5. **Re-run safety:** Always keep `project_id IS NULL` in the update scope so already-attributed rows are never reassigned.

### File structure

| Action | Path |
|--------|------|
| UPDATE | `packages/api/lib/tasks/db90.rake` — add `task :backfill_project_attribution` |

### Testing requirements

- RuboCop on the touched rake file.
- No DB mocking for a rake integration test if you add one: use transactional examples + `FactoryBot` for `Organization`, `Project`, `User`, `ProjectMembership`, `ToolEvent` with `occurred_at` set (hypertable requires `occurred_at` NOT NULL).
- If full rake invocation is awkward in CI, extract the core logic into a private method or service class **only if** the team prefers testability — default is **minimal** inline task body matching sibling tasks unless complexity explodes.

### Previous story intelligence

From `_bmad-output/implementation-artifacts/1-1-project-git-remote-ssh-to-https.md` (done): ingest now resolves `project_id` when `GET /api/v1/projects/lookup` succeeds (including SSH→HTTPS normalization). That fixes **forward** path only; this story is the **historical** `NULL` `project_id` backfill. Multi-project ambiguity was explicitly deferred there to correlation/git metadata — aligns with “do not guess” here.

### Git intelligence (recent commits)

Recent work touches project team UI and tool events display (`AIX-242`, `AIX-243` merges). This story is data-layer only; no web package changes expected.

### Latest tech / Rails note

- **Rails 8.1.2** (per `project-context.md`): confirm `Relation#limit` + `update_all` behavior; PostgreSQL `UPDATE ... FROM` generation has evolved — if `LIMIT` is stripped, use subquery `WHERE id IN (SELECT id FROM ... WHERE ... LIMIT 1000)` for deterministic batch size.

### Project context reference

See `_bmad-output/project-context.md`: run Rails commands from `packages/api/`; follow Omakase/RuboCop; no Swagger for rake-only work.

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent) — dev-story execution.

### Debug Log References

- PostgreSQL: `MIN(uuid)` is undefined; unambiguous `project_id` selection uses `(ARRAY_AGG(DISTINCT project_memberships.project_id))[1]` with `COUNT(DISTINCT ...) = 1`.

### Completion Notes List

- Added `Backfills::ProjectAttributionBackfill` (org iteration, unambiguous pairs via `ProjectMembership` + `projects.organization_id`, batched `pluck(:id)` + `update_all` in chunks of 1000, ambiguous-user unattributed counts, NULL-`user_id` event logging).
- Wired `db90:backfill_project_attribution` in `db90.rake` with optional argument `[dry_run]` (no `ENV["DRY_RUN"]`).
- RSpec: `spec/services/backfills/project_attribution_backfill_spec.rb` (single-project, multi-project, no membership, dry-run, batching >1000, NULL user_id log).
- RuboCop clean on touched files; full RSpec suite 2191 examples, 0 failures (Docker).

### File List

- `packages/api/lib/tasks/db90.rake`
- `packages/api/app/services/backfills/project_attribution_backfill.rb`
- `packages/api/spec/services/backfills/project_attribution_backfill_spec.rb`

### Change Log

- 2026-05-22: Implemented AIX-245 retroactive `project_id` backfill (rake + service) and service specs; no API/swagger changes.

---

## Open questions (saved for product — not blockers for implementation)

1. Should users with **exactly one** project membership but who were **never** in that project during the event window still get all historical events attributed? (Current spec: **yes** — conservative on wrong project vs conservative on missing stats; product owns this trade-off.)
2. Should `repository_id` be cleared or left unchanged when setting `project_id`? (Out of scope unless FK constraints require it — leave unchanged unless schema says otherwise.)
