# Story: Project aggregate stats serializer fix

Status: done

**Completion note:** Standalone BMad story created without `sprint-status.yaml` or planning artifacts. This file is the authoritative implementation brief for the project stats regression described below.

## Story

As a DB90 project owner,
I want the Projects Grid and Project Detail summary cards to read project-level aggregate stats from the project serializers,
so that attributed tool activity is reflected consistently across the UI instead of showing `0`, `$0.00`, or `Never`.

## Acceptance Criteria

1. `ProjectSerializer` and `ProjectFullSerializer` include three aggregate attributes backed by real `tool_events` data for the serialized project:
   - `event_count` = `COUNT(*)`
   - `total_cost_usd` = `COALESCE(SUM(cost_usd), 0)`
   - `last_event_at` = `MAX(occurred_at)` serialized as ISO8601, or `nil` when the project has no attributed events
2. The aggregate implementation does not introduce N+1 queries.
   - Project list responses must batch stats across all serialized projects in one grouped query.
   - Project detail may use a single aggregate query for the one project, or reuse the same batching helper for a one-element list.
3. `GET /api/v1/organizations/:organization_id/projects` returns correct event count and total cost for each project card when attributed `tool_events.project_id` rows exist.
4. `GET /api/v1/projects/:id` returns correct `eventCount`, `totalCostUsd`, and `lastEventAt` values in the serialized project payload.
5. The Project Detail summary cards bind to the serializer-backed aggregate fields rather than defaulting to missing fields or reading 30-day-only stats from a different endpoint.
6. The Project Detail summary cards for Total Events, Total Cost, and Last Activity show real attributed values and only show `Never` when the project genuinely has zero attributed events.
7. The Projects Grid uses the serializer fields with aligned naming and keeps cost formatting through `formatCost` from `packages/web/src/lib/formatters.ts`.
8. `packages/api/swagger/v1/swagger.yaml` documents the new project response fields for both list and detail responses.
9. Tests cover the new serialized fields and protect against regressions in list/detail bindings.

## Tasks / Subtasks

- [x] Backend aggregate support (AC: 1, 2, 3, 4, 8)
  - [x] Add shared aggregate-loading logic for project stats used by both `ProjectSerializer` and `ProjectFullSerializer`.
  - [x] Batch list aggregates with one `GROUP BY project_id` query over the visible project ids, following the controller-side batching pattern already used in `OrganizationMembersController#index`.
  - [x] Ensure serializer output remains camelCase over the wire (`eventCount`, `totalCostUsd`, `lastEventAt`) via Alba's `transform_keys :lower_camel`.
  - [x] Update Swagger project schemas and any example payloads impacted by these fields.
- [x] Frontend binding alignment (AC: 5, 6, 7)
  - [x] Verify `Projects.tsx` maps the new serializer fields into `ProjectCard` without fallback drift.
  - [x] Keep `ProjectCard` cost display on `formatCost`; do not introduce inline numeric formatting.
  - [x] Update `ProjectDetail.tsx` to use serializer-backed project aggregates for Total Events, Total Cost, and Last Activity.
  - [x] Remove or revise any misleading `Last 30 days` subtitle if the cards now show lifetime serializer aggregates.
- [x] Regression tests (AC: 2, 3, 4, 9)
  - [x] Extend request specs for project list/detail to assert the new fields and realistic aggregate values.
  - [x] Add or update frontend tests to cover serializer-backed values on Project Detail and list cards.

### Review Findings

- [x] [Review][Patch] `Projects.tsx` still defaults snake_case inactive rows to active when `isActive` is absent and only `is_active: false` is present. Use the same dual-shape fallback here as the new aggregate fields instead of `p.isActive ?? true`. [packages/web/src/pages/Projects.tsx:53]
- [x] [Review][Patch] `ProjectDetail.tsx` now treats missing aggregate fields as real zero activity (`0`, `$0.00`, `Never`) instead of “data unavailable”, which can show incorrect values during mixed frontend/backend deploys or any show path that misses serializer params. Guard on field presence before rendering lifetime-attributed values. [packages/web/src/pages/ProjectDetail.tsx:175]
- [x] [Review][Patch] `serializer_instance_kwargs` now wraps a proc result in `params:` even when the proc returns `nil`, which changes the serializer contract from “no params object” to `params == nil` and can break serializers that index into `params`. Return `{}` when the resolved params hash is `nil`. [packages/api/app/controllers/api/v1/base_controller.rb:68]
- [x] [Review][Patch] The new aggregate response fields are not asserted on `POST /api/v1/projects`, `POST /api/v1/organizations/:organization_id/projects`, or `PATCH /api/v1/projects/:id`, even though those controller paths now inject serializer params for them. Add request coverage so response-shape drift on `eventCount` / `totalCostUsd` / `lastEventAt` there does not ship silently. [packages/api/spec/requests/api/v1/projects_spec.rb:169]

## Dev Notes

### Root cause

The chart on Project Detail works because `GET /projects/:id/stats/daily_by_tool` queries `@project.tool_events` directly. The list and detail project payloads do not currently serialize aggregate stats, so the UI falls back to zero-like defaults.

Related prior work already fixed ingest attribution and historical project backfill:

- `AIX-247`: normalized project lookup inputs so future ingest can find the right project.
- `AIX-249` / existing story file `aix-245-backfill-project-attribution.md`: backfilled historical `tool_events.project_id` where attribution was safe.

This story is the presentation-layer follow-through: expose those already-attributed rows through the project serializers.

### Current code state to preserve

- `ProjectSerializer` currently only emits base project fields and timestamps. It has no aggregate attributes today.
- `ProjectFullSerializer` extends `ProjectSerializer` and already builds additional summaries (`sourceControlSummary`, `issueThroughputSummary`). Do not break these existing detail-only summaries.
- `ProjectsController#index` currently calls `render_collection(projects, ProjectSerializer)`, and `BaseController#render_collection` does not pass serializer context/options.
- `ProjectDetail.tsx` currently shows:
  - Total Events and Total Cost from `useProjectStats(id, 30)` (`/projects/:id/stats`)
  - a separate Created card
  - Last Activity from `project.last_event_at || project.lastEventAt`
- `Projects.tsx` already expects `event_count`, `total_cost_usd`, and `last_event_at` from the project payload and maps them into `ProjectCard`.

### Implementation guardrails

1. **Do not add per-project aggregate queries inside serializer attribute blocks for list responses.**
   That would create an N+1 across the Projects Grid.
2. **Prefer a shared aggregate loader keyed by `project_id`.**
   Good shape:
   - input: array/relation of project ids
   - query: `ToolEvent.where(project_id: ids).group(:project_id).select(...)`
   - output: hash keyed by project id with `event_count`, `total_cost_usd`, `last_event_at`
3. **Controller integration matters.**
   Because `render_collection` currently instantiates `serializer_class.new(paginated)` with no context, you will likely need one of these patterns:
   - extend `render_collection` / `render_resource` to pass serializer params, or
   - follow the `OrganizationMembersController#index` pattern and merge precomputed stats into response data outside the serializer.
   The story goal is correct data without N+1, not serializer purity for its own sake.
4. **Keep API field naming consistent with existing frontend types.**
   Serializer attribute names may be declared in snake_case Ruby, but the JSON response must remain camelCase through Alba.
5. **Do not replace the existing `/projects/:id/stats` or `/stats/daily_by_tool` endpoints.**
   They still serve charting and 30-day comparisons. This story is about serializer payloads for project entities.
6. **Detail-page semantics must be explicit.**
   The current Total Events / Total Cost cards are labeled `Last 30 days`. If you switch them to serializer aggregates, update subtitle/copy so the UI does not imply a 30-day scope when showing all-time attributed totals.
7. **Use existing formatters.**
   Cost must use `formatCost`; counts should use `formatCount` or equivalent existing formatting helper.
8. **Swagger drift is a hard failure.**
   Any response-shape change under `packages/api` must be reflected in `packages/api/swagger/v1/swagger.yaml`.

### Architecture compliance

- Backend stack is Rails 8.1 API with Alba serializers and ActionPolicy. Stay inside existing Rails controller/serializer patterns. [Source: `_bmad-output/project-context.md`]
- `ToolEvent` rows live in `timeseries.tool_events`; for stats work, prefer grouped SQL over Ruby iteration. [Source: `_bmad-output/project-context.md`]
- Frontend server state belongs in TanStack Query hooks; avoid ad hoc fetch logic in pages/components. [Source: `_bmad-output/project-context.md`]
- UI money formatting must use `packages/web/src/lib/formatters.ts`. [Source: `_bmad-output/project-context.md`]

### File targets

| Action | Path |
|--------|------|
| UPDATE | `packages/api/app/serializers/project_serializer.rb` |
| UPDATE | `packages/api/app/serializers/project_full_serializer.rb` |
| UPDATE | `packages/api/app/controllers/api/v1/projects_controller.rb` |
| OPTIONAL | `packages/api/app/controllers/api/v1/base_controller.rb` |
| UPDATE | `packages/api/swagger/v1/swagger.yaml` |
| UPDATE | `packages/api/spec/requests/api/v1/projects_spec.rb` |
| OPTIONAL | `packages/api/spec/serializers/project_serializer_spec.rb` (new file if a focused serializer spec is cleaner than request-only coverage) |
| UPDATE | `packages/web/src/pages/ProjectDetail.tsx` |
| UPDATE | `packages/web/src/pages/ProjectDetail.test.tsx` |
| UPDATE | `packages/web/src/pages/Projects.tsx` |
| UPDATE | `packages/web/src/components/projects/ProjectCard.tsx` |
| OPTIONAL | `packages/web/src/components/projects/ProjectCard.test.tsx` (new if needed for explicit card-value coverage) |

### Testing requirements

- Backend:
  - extend `packages/api/spec/requests/api/v1/projects_spec.rb`
  - assert both list and detail responses include correct aggregate fields
  - include a multi-project list example so batching logic is exercised and not only the single-project case
- Frontend:
  - update `ProjectDetail.test.tsx` to assert serializer-backed values render correctly
  - add card-level coverage if list mapping could regress silently
- Validation commands:
  - from `packages/api/`: `bundle exec rspec spec/requests/api/v1/projects_spec.rb`
  - from repo root or `packages/web/`: relevant Vitest coverage for touched UI files

### Previous story intelligence

From `_bmad-output/implementation-artifacts/aix-245-backfill-project-attribution.md`:

- Historical `tool_events` can now have `project_id` backfilled safely for unambiguous cases.
- The stated business value there was explicitly to make project-scoped cards and stats non-zero for historical activity.
- This story must not re-open attribution logic, backfill rules, or repository correlation. Assume attribution data is already correct; only expose it.

From `_bmad-output/implementation-artifacts/tool-use-event-type-enum-sync.md`:

- Keep this fix scoped. Do not mix in telemetry redesign, enum migrations, or unrelated ingest changes.

### Git intelligence

Recent commits:

- `34c820c` `[AIX-256] Added tool_use to PG event_type enum`
- `0af9b1f` merge of `feature/AIX-249-backfill-project-id`
- `244a7be` merge of `fix/AIX-247-git-remote-normalization`

Implication: this area has had several adjacent telemetry/attribution fixes recently. Keep the change narrowly focused on serializer aggregation and UI binding so review remains easy.

### Latest technical information

No external web research is required for this story. The implementation depends on stable local project conventions:

- Rails 8.1 + Alba serializer behavior already documented in repo context
- existing project request specs
- existing TanStack Query / formatter patterns in the frontend

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Prior attribution story](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/aix-245-backfill-project-attribution.md)
- [Project serializer](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/serializers/project_serializer.rb)
- [Project full serializer](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/serializers/project_full_serializer.rb)
- [Projects controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/projects_controller.rb)
- [Organization members batching pattern](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/organization_members_controller.rb)
- [Project request specs](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/requests/api/v1/projects_spec.rb)
- [Project detail page](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/ProjectDetail.tsx)
- [Projects page](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/Projects.tsx)
- [Project card](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/projects/ProjectCard.tsx)
- [Formatters](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/lib/formatters.ts)
- [Project detail tests](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/ProjectDetail.test.tsx)
- [Swagger schema](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/swagger/v1/swagger.yaml)

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `resolve_customization.py` could not run because the local Python lacks `tomllib`; workflow customization was resolved manually from `customize.toml`.
- No `sprint-status.yaml` was present under `_bmad-output/implementation-artifacts/`.
- No planning artifact files were present under `_bmad-output/planning-artifacts/`.

### Completion Notes List

- Created a standalone implementation story because the repo does not currently expose sprint-tracking metadata for automatic story selection.
- Captured the current mismatch between serializer expectations and `ProjectDetail.tsx`'s 30-day stats hook to prevent the dev agent from implementing the wrong binding.
- Added controller-level guardrails because current `render_collection` does not pass serializer context, making naive serializer-only batching easy to get wrong.
- **Implementation (2026-05-25):** Added `ProjectToolEventAggregates` (single grouped query on `timeseries.tool_events` by `project_id`). `Api::V1::BaseController` now supports optional `serializer_params` (Hash or `Proc` for collection pagination). `ProjectsController` passes `project_aggregate_stats` into Alba for index/show/create/update. `ProjectSerializer` exposes `event_count`, `total_cost_usd`, `last_event_at` (camelCase in JSON). Frontend: `Projects.tsx` reads camelCase/snake_case; `ProjectCard` uses `formatCount` for events; `ProjectDetail` overview cards use project payload aggregates with “All-time attributed” copy and no longer call `useProjectStats` for those three cards. RSpec and Vitest updated; full `make test-api` (2206 examples) green.

### File List

- `_bmad-output/implementation-artifacts/project-aggregate-stats-serializer-fix.md`
- `packages/api/app/query_builders/project_tool_event_aggregates.rb`
- `packages/api/app/serializers/project_serializer.rb`
- `packages/api/app/controllers/api/v1/base_controller.rb`
- `packages/api/app/controllers/api/v1/projects_controller.rb`
- `packages/api/swagger/v1/swagger.yaml`
- `packages/api/spec/requests/api/v1/projects_spec.rb`
- `packages/web/src/pages/Projects.tsx`
- `packages/web/src/pages/ProjectDetail.tsx`
- `packages/web/src/pages/ProjectDetail.test.tsx`
- `packages/web/src/components/projects/ProjectCard.tsx`
- `packages/web/src/components/projects/ProjectCard.test.tsx`

## Change Log

- 2026-05-25 — Implemented project lifetime aggregates in API + UI; extended `BaseController` serializer params; Swagger `Project` schema; request and Vitest coverage.

## Open questions (saved for the end)

1. `ProjectDetail.tsx` currently labels Total Events and Total Cost as `Last 30 days`, while the requested serializer fields are all-time aggregates. This story assumes the cards should switch to serializer-backed totals and the subtitle should be updated or removed.
2. `ProjectCard` currently shows `Created`, not `Last Activity`, in its third slot. This story assumes only event count and cost correctness are required there unless product/design explicitly wants `last_event_at` surfaced on the card too.
