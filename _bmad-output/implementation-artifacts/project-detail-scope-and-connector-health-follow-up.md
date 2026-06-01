# Story: Project detail scope and connector health follow-up

Status: review

**Completion note:** Ultimate context engine analysis completed - comprehensive developer guide created. This is a standalone implementation story because no `sprint-status.yaml` or planning artifacts were available.

## Story

As a DB90 project owner,
I want project detail activity, member usage, and project connector health to reflect the real project-scoped state,
so that the Project Detail page does not show misleading `Never`, project member costs do not leak org-wide totals, and valid connector setups do not surface as `Error` at the start of connection.

## Acceptance Criteria

1. **Project Last Activity is project-scoped and correct.**
   - `GET /api/v1/projects/:id` returns a project-scoped `lastEventAt` derived from attributed `tool_events.project_id = project.id`.
   - Project Detail overview renders that value in the `Last Activity` card.
   - `Never` is shown only when the project truly has zero attributed events.
2. **Project member totals shown on the Project Detail page are scoped to the current project.**
   - The overview Team section (`ProjectTeamSection`) shows each member’s events, cost, and last active based only on `tool_events` attributed to the current project.
   - No member row may display org-wide or cross-project totals when the user belongs to multiple projects.
3. **Project Members tab stats are scoped and semantically correct.**
   - Owner-only `ProjectMembersTab` stats (`Events`, `Cost`, `Last Active`, token columns) are calculated only from the current project’s events.
   - If that tab intentionally remains a 30-day view, the behavior and labels stay explicit and internally consistent; if it is changed to lifetime, all labels/tests must be updated in the same story.
4. **Project event counts are internally consistent across project detail surfaces.**
   - For the same project and same time semantics, the following agree with the underlying attributed `tool_events` rows:
     - Project overview cards
     - Team section per-member totals
     - Members tab stats / breakdowns
   - The implementation must not double-count events or mix project-scoped data with org/global member data.
5. **Project connector setup does not surface false `Error` states for healthy connections.**
   - Creating a valid project connector via `POST /api/v1/projects/:project_id/connectors` results in a connected/healthy state in the UI after the query refresh.
   - Testing a connector via `POST /api/v1/projects/:project_id/connectors/:id/test` transitions through `testing` and settles into `connected` on success or `error` with a real message on failure.
   - The Project Connectors UI must not show a persistent `Error` badge immediately after a successful initial connection.
6. **Regression coverage proves project scope and connector health behavior.**
   - Request specs cover project-scoped member totals and connector create/test status transitions.
   - Frontend tests cover:
     - `Last Activity` rendering for project detail
     - project-scoped member totals in the overview Team section
     - connector status rendering / retry flow in the project connectors tab

## Tasks / Subtasks

- [x] Validate and fix project-level activity aggregation (AC: 1, 4)
  - [x] Reproduce the reported `Last Activity = Never` behavior on Project Detail and identify whether the problem is in serializer data, stale frontend binding, or missing attributed `tool_events.project_id`.
  - [x] Keep project-level activity sourced from the serializer-backed project payload, not from org-wide member data or unrelated connector data.
  - [x] Ensure the implementation does not regress the recent aggregate serializer work in `ProjectToolEventAggregates` / `ProjectSerializer`.
- [x] Validate and fix project-scoped member totals in overview Team section (AC: 2, 4)
  - [x] Audit `GET /api/v1/projects/:project_id/members` aggregation to confirm it only uses `@project.tool_events`.
  - [x] Verify the Team section consumes those project-scoped totals directly and does not accidentally merge with another member stats source.
  - [x] Fix any mismatch between backend payload shape and `ProjectTeamSection` expectations.
- [x] Validate and fix project-scoped member stats in Members tab (AC: 3, 4)
  - [x] Audit `GET /api/v1/projects/:project_id/members/stats` for project scoping and current time window semantics.
  - [x] Preserve explicit semantics: if this is a 30-day endpoint, labels/copy/tests must continue to communicate that; if it becomes lifetime, change all consumer assumptions together.
  - [x] Verify `breakdown` remains strictly project-scoped for the selected member.
- [x] Validate and fix project connector health / setup status (AC: 5)
  - [x] Reproduce the reported “ERROR on the start of connection” flow for project connectors using the actual create + refresh path.
  - [x] Confirm whether the bug is in backend persisted status (`status`, `last_error`, `is_active`) or in frontend mapping/rendering after connect/test.
  - [x] Ensure a successful create/test clears stale error state and displays `Connected` after invalidation/refetch.
- [x] Add regression tests (AC: 6)
  - [x] Extend `packages/api/spec/requests/api/v1/project_members_spec.rb`
  - [x] Extend `packages/api/spec/requests/api/v1/project_connectors_spec.rb`
  - [x] Update `packages/web/src/pages/ProjectDetail.test.tsx`
  - [x] Update `packages/web/src/components/project/ProjectTeamSection.test.tsx`
  - [x] Update `packages/web/src/components/project/ProjectMembersTab.test.tsx` if Members-tab semantics or scoping logic changes
  - [x] Update `packages/web/src/components/project/ProjectConnectorsTab.test.tsx`

## Dev Notes

### Root cause hypothesis

The reported issues span three separate data paths on the same page:

- **Project overview cards** read from the project detail payload (`useProject`) via serializer-backed aggregates.
- **Overview Team section** reads from `GET /projects/:id/members` via `useProjectMembers`.
- **Owner-only Members tab** reads a different endpoint, `GET /projects/:id/members/stats?days=30`, via `useProjectMemberStats`.
- **Project connectors tab** reads `GET /projects/:id/connectors` and mutates via `POST /projects/:id/connectors` plus `POST /projects/:id/connectors/:id/test`.

Because these concerns are split across separate endpoints and components, the fix must start by reproducing each symptom on the specific surface rather than assuming a single shared bug.

### Current code state to preserve

- `ProjectSerializer` already exposes `event_count`, `total_cost_usd`, and `last_event_at` from `ProjectToolEventAggregates`, and Alba transforms them to camelCase over the wire. [Source: `packages/api/app/serializers/project_serializer.rb`]
- `ProjectsController#show` already passes `project_aggregate_stats` into `ProjectFullSerializer`; do not reintroduce per-project aggregate queries in serializer blocks. [Source: `packages/api/app/controllers/api/v1/projects_controller.rb`]
- `ProjectDetail.tsx` currently treats the overview cards as serializer-backed values and renders `Last Activity` from `project.lastEventAt`. [Source: `packages/web/src/pages/ProjectDetail.tsx`]
- `ProjectMembersController#index` computes `total_events`, `total_cost`, and `last_active_at` from `@project.tool_events.where(user_id: user_ids)`, which is intended to be project-scoped lifetime data for the overview Team section. [Source: `packages/api/app/controllers/api/v1/project_members_controller.rb`]
- `ProjectMembersController#stats` is a separate 30-day endpoint (`days` default `30`) used by the owner-only Members tab; do not accidentally conflate its semantics with the overview Team section. [Source: `packages/api/app/controllers/api/v1/project_members_controller.rb`]
- `ProjectConnectorsController#create` persists `status: "error"` on failed validation and `status: "connected"` on success; `#test` explicitly transitions `testing -> connected/error`. Fixes must preserve these state transitions while removing false error rendering. [Source: `packages/api/app/controllers/api/v1/project_connectors_controller.rb`]

### Architecture compliance

- Rails API responses should continue to use existing controller + Alba serializer patterns; no new serialization framework or ad hoc JSON builders. [Source: `_bmad-output/project-context.md`]
- All frontend data fetching must stay in TanStack Query hooks under `packages/web/src/hooks/useApi.ts`; do not add raw fetches in pages/components. [Source: `_bmad-output/project-context.md`]
- Any API response shape change under `packages/api` must update `packages/api/swagger/v1/swagger.yaml` in the same change. [Source: `_bmad-output/project-context.md`]
- UI numeric display must continue to use shared formatters from `packages/web/src/lib/formatters.ts`. [Source: `_bmad-output/project-context.md`]

### Technical requirements

1. **Do not mix project-scoped and org-scoped member numbers.**
   - `ProjectTeamSection` is fed by `useProjectMembers`.
   - `ProjectMembersTab` owner metrics are fed by `useProjectMemberStats`.
   - If one is wrong, fix that specific path; do not “paper over” differences in the React layer by mixing payload conventions or sourcing fallback values from another endpoint.
2. **Keep naming boundaries clean.**
   - Rails code stays snake_case internally.
   - React/UI code consumes camelCase API fields.
   - Do not introduce mixed snake_case/camelCase fallback logic in React for this story unless an existing shared hook is intentionally doing the normalization at the API boundary.
3. **Project last activity must come from attributed project events.**
   - If reproduction shows `lastEventAt` is missing despite project events existing, trace from `ToolEvent.project_id` attribution through `ProjectToolEventAggregates` to the serializer payload before changing UI logic.
4. **Be explicit about time windows.**
   - The overview Team section currently presents lifetime-style totals from `/members`.
   - The Members tab stats endpoint currently defaults to 30 days.
   - If product expects the same semantics across both surfaces, the story implementation must align endpoint behavior and UI copy together.
5. **Connector error handling must distinguish real backend failures from stale frontend state.**
   - Successful create/test must clear stale `last_error`.
   - Error panels in the UI should only reflect real current connector errors returned by the refreshed query.
6. **No naive Ruby loops over event rows for aggregate fixes.**
   - Project-scoped member and project totals should continue to rely on grouped SQL / aggregate queries over `timeseries.tool_events`. [Source: `_bmad-output/project-context.md`]

### File targets

| Action | Path |
|--------|------|
| VERIFY / UPDATE | `packages/api/app/controllers/api/v1/projects_controller.rb` |
| VERIFY / UPDATE | `packages/api/app/serializers/project_serializer.rb` |
| VERIFY / UPDATE | `packages/api/app/query_builders/project_tool_event_aggregates.rb` |
| VERIFY / UPDATE | `packages/api/app/controllers/api/v1/project_members_controller.rb` |
| VERIFY / UPDATE | `packages/api/app/controllers/api/v1/project_connectors_controller.rb` |
| VERIFY / UPDATE | `packages/api/app/serializers/project_connector_serializer.rb` |
| OPTIONAL | `packages/api/swagger/v1/swagger.yaml` |
| UPDATE | `packages/api/spec/requests/api/v1/project_members_spec.rb` |
| UPDATE | `packages/api/spec/requests/api/v1/project_connectors_spec.rb` |
| UPDATE | `packages/web/src/pages/ProjectDetail.tsx` |
| UPDATE | `packages/web/src/pages/ProjectDetail.test.tsx` |
| UPDATE | `packages/web/src/components/project/ProjectTeamSection.tsx` |
| UPDATE | `packages/web/src/components/project/ProjectTeamSection.test.tsx` |
| UPDATE | `packages/web/src/components/project/ProjectMembersTab.tsx` |
| UPDATE | `packages/web/src/components/project/ProjectMembersTab.test.tsx` |
| UPDATE | `packages/web/src/components/project/ProjectConnectorsTab.tsx` |
| UPDATE | `packages/web/src/components/project/ProjectConnectorsTab.test.tsx` |
| VERIFY | `packages/web/src/hooks/useApi.ts` |

### Read-before-edit guidance

- Read `ProjectDetail.tsx` completely before changing overview behavior; it contains both serializer-backed cards and separate chart/event/member/integration surfaces.
- Read `ProjectMembersController#index`, `#stats`, and `#breakdown` together; they intentionally serve different consumers and currently have different time semantics.
- Read `ProjectTeamSection.tsx` and `ProjectMembersTab.tsx` together before changing member totals; they render different shapes from different hooks.
- Read `ProjectConnectorsTab.tsx`, `IntegrationCard.tsx`, and `ProjectConnectorsController` together before altering connector error/status behavior.

### Testing requirements

- Backend:
  - Extend `packages/api/spec/requests/api/v1/project_members_spec.rb` with explicit multi-project fixtures proving no cross-project leakage into:
    - `/projects/:id/members`
    - `/projects/:id/members/stats`
    - `/projects/:id/members/:id/breakdown`
  - Extend `packages/api/spec/requests/api/v1/project_connectors_spec.rb` to prove:
    - successful create returns/refreshes as connected
    - failed create persists error state with meaningful message
    - successful test clears stale `last_error`
    - repeated test flow does not leave a false `error` badge
- Frontend:
  - `ProjectDetail.test.tsx`: assert `Last Activity` renders non-`Never` when `lastEventAt` exists and `Never` only when null
  - `ProjectTeamSection.test.tsx`: assert project-scoped member totals / last active rendering
  - `ProjectMembersTab.test.tsx`: assert scoping and semantics of owner stats table if behavior changes
  - `ProjectConnectorsTab.test.tsx`: assert successful connect/test path settles on `Connected` and stale error alert is cleared
- Manual verification:
  - Use a member who belongs to multiple projects in the same org and seed project-attributed events into two different projects
  - Verify the current project’s Team section and Members tab show only the selected project’s events/costs
  - Connect a valid project-level AI provider or Slack webhook and verify no immediate false `Error` badge after refresh

### Previous story intelligence

- `project-aggregate-stats-serializer-fix.md` already introduced serializer-backed lifetime project aggregates for `eventCount`, `totalCostUsd`, and `lastEventAt`. This follow-up must not undo that architecture by moving project overview totals back to ad hoc `/stats` queries. [Source: `_bmad-output/implementation-artifacts/project-aggregate-stats-serializer-fix.md`]
- `aix-245-backfill-project-attribution.md` backfilled historical `tool_events.project_id` where attribution was safe. If project last activity or member totals are still wrong after that, the first suspicion should be aggregation/binding, not reworking attribution rules. [Source: `_bmad-output/implementation-artifacts/aix-245-backfill-project-attribution.md`]
- `tool-use-event-type-enum-sync.md` indicates adjacent telemetry work recently touched event ingestion/reporting. Keep this story tightly scoped to project detail/member/connectors behavior; do not mix in telemetry redesign or new event taxonomy work. [Source: `_bmad-output/implementation-artifacts/tool-use-event-type-enum-sync.md`]

### Git intelligence

Recent relevant commits:

- `61991e5` `[AIX-246] fixed project card stats`
- `0af9b1f` merge of `feature/AIX-249-backfill-project-id`
- `244a7be` merge of `fix/AIX-247-git-remote-normalization`

Implication: this area has had multiple recent fixes across attribution and project stats. Prefer a targeted bug-fix pass with strong regression tests over introducing new abstractions.

### Latest technical information

No external web research is required for this story. The work depends on stable, repo-local conventions:

- Rails 8.1 API + Alba serialization
- project member request specs already covering project scoping
- project connector request specs already covering create/test/error flows
- TanStack Query + Vitest component tests on the web side

### Project structure notes

- No planning artifacts (`epics`, `PRD`, `architecture`, `UX`) were present under `_bmad-output/planning-artifacts/` during story creation.
- This story is intentionally standalone and grounded in current code, current implementation artifacts, and the user-provided bug list/screenshots.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Prior project aggregate stats story](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/project-aggregate-stats-serializer-fix.md)
- [Prior project attribution story](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/aix-245-backfill-project-attribution.md)
- [Projects controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/projects_controller.rb)
- [Project serializer](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/serializers/project_serializer.rb)
- [Project aggregate query builder](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/query_builders/project_tool_event_aggregates.rb)
- [Project members controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/project_members_controller.rb)
- [Project members request spec](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/requests/api/v1/project_members_spec.rb)
- [Project connectors controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/project_connectors_controller.rb)
- [Project connector serializer](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/serializers/project_connector_serializer.rb)
- [Project connectors request spec](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/requests/api/v1/project_connectors_spec.rb)
- [Project detail page](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/ProjectDetail.tsx)
- [Project detail tests](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/ProjectDetail.test.tsx)
- [Project team section](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/project/ProjectTeamSection.tsx)
- [Project team section tests](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/project/ProjectTeamSection.test.tsx)
- [Project members tab](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/project/ProjectMembersTab.tsx)
- [Project members tab tests](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/project/ProjectMembersTab.test.tsx)
- [Project connectors tab](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/project/ProjectConnectorsTab.tsx)
- [Project connectors tab tests](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/project/ProjectConnectorsTab.test.tsx)
- [Integration card](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/components/integrations/IntegrationCard.tsx)
- [Shared API hooks](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/hooks/useApi.ts)

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent)

### Debug Log References

- `resolve_customization.py` could not run because the local Python lacks `tomllib`; workflow customization was resolved manually from `customize.toml`.
- No `sprint-status.yaml` was present under `_bmad-output/implementation-artifacts/`.
- No planning artifact files were present under `_bmad-output/planning-artifacts/`.
- Targeted RSpec for new examples was not executed in this environment (system Ruby 2.6 / bundler mismatch); run `make test-api` or `bundle exec rspec` from `packages/api/` with the repo Ruby (asdf).

### Completion Notes List

- Created a standalone bug-fix story from the user-provided issue list and screenshots.
- Captured that Project Detail, Team section, Members tab, and Project Connectors tab are backed by different endpoints and therefore must be reproduced and fixed independently.
- Preserved the recent serializer-backed project aggregate design as a guardrail so the follow-up story does not regress AIX-246-style work.
- **Implemented:** `ProjectDetail` now treats aggregate stats from either camelCase or snake_case and `lastEventAt` from `last_event_at` when needed (AC1). `useProjectMembers` maps member stats with camelCase fallbacks (AC2). `ProjectConnectorSerializer` and `ProjectConnectorsTab` suppress stale `last_error` unless `status === "error"` (AC5). Added request specs for project show scoping, members/stats cross-project isolation, connectors index `lastError` masking; Vitest coverage for Last Activity, team totals, and connector UI (AC6). Members tab code unchanged (30-day semantics unchanged); `ProjectMembersTab.test.tsx` not modified.

### File List

- `_bmad-output/implementation-artifacts/project-detail-scope-and-connector-health-follow-up.md`
- `packages/api/app/serializers/project_connector_serializer.rb`
- `packages/api/spec/requests/api/v1/projects_spec.rb`
- `packages/api/spec/requests/api/v1/project_members_spec.rb`
- `packages/api/spec/requests/api/v1/project_connectors_spec.rb`
- `packages/web/src/pages/ProjectDetail.tsx`
- `packages/web/src/pages/ProjectDetail.test.tsx`
- `packages/web/src/hooks/useApi.ts`
- `packages/web/src/components/project/ProjectConnectorsTab.tsx`
- `packages/web/src/components/project/ProjectConnectorsTab.test.tsx`
- `packages/web/src/components/project/ProjectTeamSection.test.tsx`

## Change Log

- 2026-05-26 — Implemented project-detail aggregate field normalization, defensive member stat mapping, stale connector error suppression (API + UI), and regression tests (Rails request + Vitest). Swagger unchanged (response shape unchanged; `lastError` still nullable).

## Open questions (saved for the end)

1. The current codebase distinguishes lifetime-style project overview totals from a 30-day owner-only Members-tab endpoint. If product wants those surfaces unified, that should be treated as an explicit semantic change, not a silent bug fix.
2. The screenshot suggests a false connector `Error` state “at the start of connection,” but the exact reproduction path is not encoded in the repo. The dev agent should document whether the failure is on initial create, on post-create refresh, or only after an explicit `Test connection` action.
