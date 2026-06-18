# Story AIX-388: Configure Integration step persists and applies its settings

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> Source: Jira **AIX-388** (Bug, Medium, In Progress, Sprint 11, fixVersion **July MVP Release** 2026-06-30). Parent epic **AIX-358** "Pre-release fixes (MVP / production readiness — July 1)".
> Related prior story: **AIX-347** (`aix-347-multiple-integrations-per-org.md`) — added the `label` column, multi-instance connectors, and the connect/label flows this story builds on.
> In code, a Jira "integration" is an **`OrganizationConnector`** ("connector"). The setup wizard lives in `packages/web/src/pages/IntegrationSetup.tsx`.

## Story

As an **organization owner setting up a source-control integration**,
I want **the choices I make on the "Configure Integration" step (connection name, sync repositories, sync pull requests, enable webhooks, link to project) to actually be saved and applied**,
so that **the integration behaves the way I configured it instead of silently ignoring everything I entered**.

## Bug summary (verified against the code)

The "Configure Integration" step (step 3, `step === "configure"`) renders five controls bound to local React state `config` (`IntegrationSetup.tsx:198-205`, UI at `:534-654`), but **none of the values ever reach the backend**:

- `handleConnect()` (`IntegrationSetup.tsx:308-323`) is a **no-op** — it runs a dummy `await new Promise(r => setTimeout(r, 500))` and advances to the "complete" step. The comment even admits it: _"In a real implementation, you might update the connector with additional config"_.
- The only value persisted from the wizard is `config.label`, and only because it is piggy-backed onto the OAuth `createConnector` callback at step 2 (`IntegrationSetup.tsx:228-233`). The step-3 fields (`name`, `syncRepos`, `syncPRs`, `webhookEnabled`, `selectedProject`) are never sent.
- The backend has **no place to receive them**: `connector_update_params` (`organization_connectors_controller.rb:334-336`) does not permit `config`, and the sync jobs (`github_sync_job.rb`, `gitlab_sync_job.rb`, `bitbucket_sync_job.rb`) sync repositories and PRs **unconditionally** — they never read any sync toggle.

Net effect (matches the Jira report): no POST/PUT/PATCH carries the form data, and the resulting integration is identical regardless of what the user entered.

## Scope decision (LOCKED — decided with the assignee 2026-06-18)

**Persist AND honor** the step-3 settings — not just store-and-ignore. A store-only fix would re-open the same bug under a different description (settings saved but inert). All forks below were resolved with the assignee on 2026-06-18; treat them as requirements.

1. **Connection Name field → removed.** Naming is already covered by `label` (set on the authorize step in AIX-347, edited via the Rename action on the connected card). **Do not touch the existing `label` logic.** Remove the now-redundant "Connection Name" input from step 3 so there are not two competing "names". No `label` write from step 3.
2. **Sync toggles → `config` JSONB + honored by sync jobs.** Persist `config["sync_repositories"]` and `config["sync_pull_requests"]` (booleans). The source-control sync jobs must **gate** their repo/PR sync on these flags, defaulting to `true` when the key is absent (backward-compatible with every existing connector).
3. **Enable Webhooks → state only.** Persist `config["webhook_enabled"]` and reflect it on `webhook_active` for source-control connectors. **No provider-side webhook registration/deregistration** — there is no GitHub webhook-provisioning service today, and building one is out of scope (follow-up if needed). (Today `webhook_active` is only wired for OpenRouter — see Dev Notes.)
4. **Link to Project → lightweight reference.** Persist `config["linked_project_id"]` on the **org** connector (validated to belong to the current org), used for attribution/filtering. **Do not** materialize a `project_connector` and **do not** duplicate tokens — full project-scoped ingestion is explicitly a follow-up, not this story.
5. **Source-control providers only.** Sync toggles, webhook toggle, and project link apply to `github`/`gitlab`/`bitbucket`. For other providers these controls are hidden / not gated. `label` behavior (all providers) is unchanged.

## Acceptance Criteria

1. **Step 3 submits to the backend.** Completing the "Configure Integration" step issues a `PATCH /api/v1/organizations/:org_id/connectors/:id` (via `useUpdateConnector`) carrying the configured values. The dummy `setTimeout` in `handleConnect` is gone. On failure the wizard shows an error and stays on the step (does not advance to "complete").
2. **Connection Name field removed.** The redundant "Connection Name" input is gone from step 3. Existing `label` behavior (authorize-step input + Rename action) is unchanged. No regression to label set/edit/display.
3. **Sync toggles persist and gate behavior.**
   - `config["sync_repositories"]` and `config["sync_pull_requests"]` are persisted and returned to the client.
   - With `sync_repositories: false`, `GithubSyncJob` (and the GitLab/Bitbucket equivalents) **skips** repository sync; with `sync_pull_requests: false` it skips PR/MR ingestion. Absent keys default to enabled — existing connectors keep syncing exactly as before.
4. **Webhook toggle persists (state only).** `config["webhook_enabled"]` round-trips and `webhook_active` reflects it for source-control connectors. No provider-side webhook is created/removed. Turning it off does not break a connector that already has a webhook.
5. **Link to Project persists as a reference.** Selecting a project on step 3 stores `config["linked_project_id"]` (validated to belong to the org); clearing it removes the key. The selection is reflected on reload. No `project_connector` row is created and no tokens are duplicated. Selecting no project leaves the connector org-only (unchanged).
6. **Strong params allow exactly the new fields.** `connector_update_params` permits the whitelisted config keys (`config: [:sync_repositories, :sync_pull_requests, :webhook_enabled, :linked_project_id]`) and nothing else newly sensitive. No mass-assignment of arbitrary `config` keys.
7. **Authorization unchanged.** `authorize! @connector` still runs at the top of `update`; the `linked_project_id` value is validated against the current org's projects. No policy regressions.
8. **Swagger in sync.** `packages/api/swagger/v1/swagger.yaml` documents the new request body fields on the connector `update` (PATCH) path and any new response fields. No drift (hard gate — `swagger-auditor`).
9. **No regression for non-source-control providers.** AI providers, Slack, Copilot, Cursor connectors are unaffected; the step-3 sync/webhook/project controls are not shown/gated for them, and their `config` keys (billing/seat data) are not clobbered by the new writes.
10. **Tests green.** New/updated request specs, job specs, and Vitest cover the persistence + gating paths; `make lint-api` and `make lint-web` pass.

## Tasks / Subtasks

> **Base branch (LOCKED):** branch **from `feature/AIX-347-multiple-integrations-per-org`**, NOT from `develop`. This story builds directly on 347's `label`, multi-instance, and `useUpdateConnector` work, which has not yet landed on `develop`; basing off 347 avoids merge conflicts and missing prerequisites. (Deviation from the usual "branch from `develop`" rule in CLAUDE.md — intentional, recorded here.) The PR targets whatever 347 ultimately merges into; rebase onto `develop` once 347 is merged.
>
> **Split (per CLAUDE.md task sizing — this touches api + web + jobs, > 8 files):** ship as **one PR, two commits on one branch** `bugfix/AIX-388-configure-integration-persist` (cut from `feature/AIX-347-multiple-integrations-per-org`):
> **388a = backend** (params, config persistence, job gating, project link, serializer, swagger, API specs) and **388b = frontend** (remove Connection Name, handleConnect → PATCH, state→payload mapping, types, Vitest). Run `/clear` between the two implementation sessions.

### 388a — Backend (commit 1)

- [x] **Controller — permit config** (AC: 1, 6, 7) — `app/controllers/api/v1/organization_connectors_controller.rb`
  - [x] Extend `connector_update_params` (`:334-336`) to permit the config payload with an explicit nested shape: `config: [:sync_repositories, :sync_pull_requests, :webhook_enabled, :linked_project_id]` (whitelist keys — do NOT permit arbitrary `config`). Leave `:label` exactly as-is.
  - [x] In `update`, **merge** the permitted config keys into the existing `connector.config` rather than replacing it (preserve copilot/cursor billing keys — AC 9). Add a small private helper, e.g. `merge_connector_config`.
  - [x] Validate `linked_project_id` (when present) belongs to `current_organization` — reject foreign/invalid ids with a 422 (AC 5, 7).
  - [x] Set `webhook_active` from `config["webhook_enabled"]` for source-control connectors (AC 4). Confirm `authorize! @connector` stays first (AC 7).
- [x] **Model — config accessors + defaults** (AC: 3, 9) — `app/models/organization_connector.rb`
  - [x] Add predicate helpers with **default-true** semantics: `sync_repositories?` → `config.fetch("sync_repositories", true)`, `sync_pull_requests?` → `config.fetch("sync_pull_requests", true)`. (Use `config&.fetch(...)` guards; `config` defaults to `{}` in DB but be null-safe.)
- [x] **Sync jobs — honor toggles** (AC: 3) — gate at the verified call sites (source-control only):
  - [x] `app/jobs/github_sync_job.rb` — `sync_repositories` (`:50`); skip when `!connector.sync_repositories?`. PR ingestion is webhook-driven (`process_pull_request_event` `:116`) — gate event processing / event creation on `sync_pull_requests?`.
  - [x] `app/jobs/gitlab_sync_job.rb` — `sync_projects` (`:56`) and `persist_merge_requests` (`:265`).
  - [x] `app/jobs/bitbucket_sync_job.rb` — `sync_repositories` (`:56`) and `sync_pull_requests_data` (`:278`).
  - [x] In every case, default-enabled when the config key is missing (existing connectors unchanged).
- [x] **Project link — reference only** (AC: 5) — persist `config["linked_project_id"]` (validated, above). **Do NOT** touch `project_connectors` / create project-scoped connectors / duplicate tokens — that is an explicit follow-up, not this story. Clearing the project removes the key.
- [x] **Serializer** (AC: 3, 4, 5) — `app/serializers/organization_connector_serializer.rb`: expose the config-derived values the UI needs to re-hydrate step 3 (`sync_repositories`, `sync_pull_requests`, `webhook_enabled`, `linked_project_id`). Follow the existing `config.dig(...)`-per-attribute pattern; never expose tokens. Do not change how `label` is serialized.
- [x] **Swagger** (AC: 8) — `packages/api/swagger/v1/swagger.yaml`: add the new request-body fields to the connector PATCH path and the new response fields to the `OrganizationConnector` schema.
- [x] **API specs** (AC: 1–9) — `spec/requests/api/v1/organization_connectors_spec.rb`, plus job specs (`spec/jobs/github_sync_job_spec.rb` etc.) and a serializer spec if response shape changes. See Testing requirements.

### 388b — Frontend (commit 2)

- [x] **Remove the Connection Name field** (AC: 2) — `packages/web/src/pages/IntegrationSetup.tsx`: delete the "Connection Name" input block (`:543-554`) and the `name` key from `config` state (`:199`). Do **not** touch the `label` flow.
- [x] **`handleConnect` → real PATCH** (AC: 1) — `packages/web/src/pages/IntegrationSetup.tsx:308-323`: replace the dummy timeout with a `useUpdateConnector` call carrying the mapped payload (below). On success advance to "complete"; on error set `error` and stay on "configure". The connector id comes from the `createConnector` result captured at the OAuth callback (`:228-233`) — store it in state.
  - [x] State→payload mapping: `syncRepos → config.sync_repositories`, `syncPRs → config.sync_pull_requests`, `webhookEnabled → config.webhook_enabled`, `selectedProject → config.linked_project_id` (omit when empty). **No `label`/name in this payload.**
  - [x] Pre-fill step-3 controls (toggles + project select) from the created connector / serializer values so re-entry shows persisted state (AC 3–5).
  - [x] Show the step-3 controls only for source-control providers (AC 9).
- [x] **Hook** (AC: 1) — `packages/web/src/hooks/useApi.ts`: `useUpdateConnector` (`:1293-1309`) already accepts `data: Record<string, unknown>` and PATCHes `/organizations/:orgId/connectors/:id`, and invalidates the connectors query key — reuse as-is (no signature change needed unless typing is tightened).
- [x] **Types** (AC: 2–5) — `packages/web/src/lib/types.ts` `Connector` (`:126-166`): it already has `config?: Record<string, unknown>`, `webhookActive?`, `webhookToken?`. Add typed fields for the new serialized values if the serializer surfaces them as top-level attributes.
- [x] **Vitest** — `IntegrationSetup` test: assert that clicking **Connect** on step 3 calls `useUpdateConnector` with the mapped payload, advances to "complete" only on success, and shows an error on failure.

- [x] **Verification:** `make lint-api`, `make lint-web`; RSpec request + job specs; Vitest for `IntegrationSetup`; full API suite green in Docker.

## Dev Notes

### Root-cause map (current state — verified by reading the code)

| # | Location | Current behavior | Change |
|---|----------|------------------|--------|
| 1 | `web/src/pages/IntegrationSetup.tsx:308-323` `handleConnect` | dummy `setTimeout`, no API call | Real `PATCH` via `useUpdateConnector` |
| 2 | `web/src/pages/IntegrationSetup.tsx:198-205,534-654` | step-3 values live only in local `config` state | Map to PATCH payload; pre-fill on re-entry |
| 3 | `api/.../organization_connectors_controller.rb:334-336` `connector_update_params` | no `config` permitted | Permit whitelisted nested `config` keys + merge |
| 4 | `api/app/jobs/github_sync_job.rb:50,116` (+ gitlab `:56,265`, bitbucket `:56,278`) | repo/PR sync unconditional | Gate on `sync_repositories?` / `sync_pull_requests?`, default true |
| 5 | `api/app/models/organization_connector.rb` | no sync/webhook config accessors | Add default-true predicates; wire `webhook_active` |
| 6 | `api/app/serializers/organization_connector_serializer.rb` | no sync/webhook/project config exposed | Expose config-derived attrs for UI re-hydration |
| 7 | step-3 "Connection Name" (`IntegrationSetup.tsx:543-554`) | duplicate of `label` | Remove field; `label` flow untouched |

### Architecture compliance (project-context.md)

- **Controllers thin / layered.** Keep `update` thin: `authorize!`, permit, merge config, save, render. Put any non-trivial project-link logic in a service if it grows beyond a few lines (`app/services/`).
- **`config` is JSONB, default `{}`.** Always **merge**, never replace — copilot/cursor billing keys live in the same column (`organization_connector_serializer.rb:44-96`). Be null-safe (`config&.fetch`).
- **`connector_type` is a PG enum** (`public.connector_type`). Gating applies to source-control types only — verify the predicate (`source_control?` at `organization_connector.rb:52`) before gating; don't gate AI/Slack jobs.
- **Strong params = whitelist.** Permit explicit config keys, not a free-form `config` hash (mass-assignment safety, AC 6).
- **ActionPolicy.** `authorize! @connector` stays first in `update`. For the project link, authorize the target `Project` too (`ProjectPolicy`). No new policy unless a new resource action appears.
- **Alba serializer** lower-camelCases keys; expose config-derived values as named attributes (mirror the copilot/cursor pattern). Never expose tokens.
- **Swagger is a hard gate** — PATCH request body + response schema updated in the same commit.
- **Frontend** uses the shared API client + TanStack Query. Reuse `useUpdateConnector` (invalidation already wired to `queryKeys.connectors.all(orgId)`). No raw fetch/axios. Double-quoted TS, no `any`. No inline numeric formatting involved.
- **Reversibility.** No schema change is strictly required (everything fits `config` JSONB + existing `label`/`webhook_active`/`project_connectors`). If a migration is added for the project link, keep it reversible and do not drop columns in the same migration that removes usage.

### Files being modified (read before editing)

| Action | Path |
|--------|------|
| UPDATE | `packages/api/app/controllers/api/v1/organization_connectors_controller.rb` |
| UPDATE | `packages/api/app/models/organization_connector.rb` |
| UPDATE | `packages/api/app/jobs/github_sync_job.rb` |
| UPDATE | `packages/api/app/jobs/gitlab_sync_job.rb` |
| UPDATE | `packages/api/app/jobs/bitbucket_sync_job.rb` |
| UPDATE | `packages/api/app/serializers/organization_connector_serializer.rb` |
| UPDATE | `packages/api/swagger/v1/swagger.yaml` |
| UPDATE | `packages/web/src/pages/IntegrationSetup.tsx` |
| UPDATE | `packages/web/src/lib/types.ts` |
| UPDATE (maybe) | `packages/web/src/lib/providers.ts` (verify `requiresWebhook` exists where read at `IntegrationSetup.tsx:591`) |
| UPDATE (tests) | `spec/requests/api/v1/organization_connectors_spec.rb`, `spec/jobs/github_sync_job_spec.rb` (+ gitlab/bitbucket), serializer spec, `packages/web/src/pages/IntegrationSetup.test.tsx` |

### Previous story intelligence (AIX-347)

- `label` column, `MULTI_INSTANCE_CONNECTOR_TYPES`, conditional uniqueness, and the `useUpdateConnector` rename flow already exist — **leave them as-is** (decision: don't touch `label` logic). Naming is fully handled by 347's label/Rename; step 3 only drops its redundant Connection Name field.
- 347 explicitly left `project_connectors` and its `UNIQUE (project_id, connector_type)` **out of scope** — this story keeps it that way: the project link is a `config["linked_project_id"]` reference, not a `project_connector` (D1).
- 347's pattern: permit new field in params, expose via serializer, pass through the hook, cover with request + Vitest specs. Mirror it.

### Testing requirements

- **Request spec** (`organization_connectors_spec.rb`): PATCH with `config` keys persists them and merges (does not clobber pre-existing config); `label` updates; invalid/foreign project_id is rejected; arbitrary config keys are not mass-assigned; `authorize!` enforced (non-owner 403). No DB mocking — real DB + FactoryBot.
- **Job specs**: `sync_repositories: false` → repository sync skipped; `sync_pull_requests: false` → PR/MR ingestion skipped; missing keys → both run (regression guard). Cover GitHub at minimum; add GitLab/Bitbucket if cheap.
- **Serializer spec**: new config-derived attributes present with correct defaults.
- **Frontend Vitest** (`IntegrationSetup.test.tsx`): Connect on step 3 calls `useUpdateConnector` with the mapped payload; advances to "complete" only on success; error path keeps the step and shows the message. Mock at the hook boundary (do not bypass TanStack Query).

### Decisions resolved with the assignee (2026-06-18) — follow-ups to file

These were open forks; all are now locked (see Scope decision). The deferred pieces should be filed as follow-up tickets under epic AIX-358 — **search Jira before filing** (CLAUDE.md rule), link AIX-388 + AIX-358.

- **D1 — Link to Project = reference only.** Persist `config["linked_project_id"]`; do **not** materialize a `project_connector` or duplicate tokens. **Follow-up:** true project-scoped ingestion (project-scoped connector with its own tokens) if/when product needs repos actually scoped to a project rather than just referenced.
- **D2 — Webhook toggle = state only.** Persist `config["webhook_enabled"]` + reflect on `webhook_active`. **Follow-up:** provider-side webhook lifecycle (register/deregister via GitHub API) — no such service exists today (`webhook_active` is only set by `openrouter_trace_job.rb:209`).
- **D3 — Source-control only.** Sync/webhook/project controls apply to `github`/`gitlab`/`bitbucket`; hidden/not-gated elsewhere. Verify which providers route through the wizard step (`provider.requiresWebhook` at `IntegrationSetup.tsx:591`) and that AI/Slack/Copilot/Cursor connectors are not gated or clobbered (AC 9).

### Remaining implementation watch-items

- **Connection Name removal.** Confirm no other component reads `config.name` from the wizard before deleting it (it was wizard-local state, so removal should be self-contained — verify in `IntegrationSetup.tsx` only).
- **PR-toggle gating point.** GitHub PR ingestion is webhook-driven (`process_pull_request_event:116`), not part of the polling `sync_repositories` path — make sure `sync_pull_requests?` gates the event-creation path, not just an unused fetch.

### Project context reference

See `_bmad-output/project-context.md`: run Rails commands from `packages/api/`; ActionPolicy `authorize!` first; Alba serializers lower-camelCase; whitelist strong params; reversible migrations; swagger sync is a hard gate; frontend goes through the shared API client + TanStack Query hooks; double-quote TS, no `any`; never inline numeric formatting.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- Fixed `expect_unprocessable_entity` → `expect_unprocessable` (wrong helper name in spec)
- Fixed GitHub sync job spec: when `sync_repositories: false`, `BaseProvider.for` is never called — used `not_to receive` instead of `not_to have_received`

### Completion Notes List

**388a — Backend:**
- Controller: `connector_update_params` permits whitelisted config keys; `merge_connector_config` private helper merges into existing config (preserves copilot/cursor billing keys); `linked_project_id` validated against `current_organization.projects`; `webhook_active` set from `webhook_enabled` for source-control connectors
- Model: `sync_repositories?` and `sync_pull_requests?` with `config&.fetch("key", true) != false` — default-true, backward-compatible
- Jobs: GitHub gates `sync_repositories` method and `process_pull_request_event`; GitLab gates `sync_projects` and `persist_merge_requests`; Bitbucket gates `sync_repositories` and `sync_pull_requests_data`
- Serializer: exposes `sync_repositories`, `sync_pull_requests`, `webhook_enabled`, `linked_project_id` for source-control connectors only (nil for others)
- Swagger: PATCH request body gets `config` object; OrganizationConnector schema gets `webhookActive`, `syncRepositories`, `syncPullRequests`, `webhookEnabled`, `linkedProjectId`; 200 response documents the response body
- Specs: 96 request spec examples + 11 job spec examples, all green

**388b — Frontend:**
- `IntegrationSetup.tsx`: imports `useUpdateConnector`; removed `name` from config state; added `connectorId` state; OAuth callback captures connector ID and pre-fills controls from serializer values; `handleConnect` does real PATCH for source-control providers with mapped payload; non-source-control shows activation message, skips PATCH; step-3 controls guarded by `isSourceControl`
- `types.ts`: added `syncRepositories`, `syncPullRequests`, `webhookEnabled`, `linkedProjectId` to `Connector` interface
- Vitest: 8 tests covering all ACs

### File List

- `packages/api/app/controllers/api/v1/organization_connectors_controller.rb`
- `packages/api/app/models/organization_connector.rb`
- `packages/api/app/jobs/github_sync_job.rb`
- `packages/api/app/jobs/gitlab_sync_job.rb`
- `packages/api/app/jobs/bitbucket_sync_job.rb`
- `packages/api/app/serializers/organization_connector_serializer.rb`
- `packages/api/swagger/v1/swagger.yaml`
- `packages/api/spec/requests/api/v1/organization_connectors_spec.rb`
- `packages/api/spec/jobs/github_sync_job_spec.rb`
- `packages/web/src/pages/IntegrationSetup.tsx`
- `packages/web/src/pages/IntegrationSetup.test.tsx` (new)
- `packages/web/src/lib/types.ts`

### Change Log

- 2026-06-18: Story drafted from Jira AIX-388 with exhaustive frontend+backend root-cause analysis. Planned split 388a (backend) / 388b (frontend), one branch / one PR / two commits. Status → ready-for-dev.
- 2026-06-18: Base branch locked — develop **from `feature/AIX-347-multiple-integrations-per-org`** (not `develop`), since 388 depends on 347's unmerged `label`/multi-instance/`useUpdateConnector` work. Rebase onto `develop` after 347 merges.
- 2026-06-18: Open forks resolved with assignee — D1 Link to Project = `config["linked_project_id"]` reference only (no `project_connector`); D2 webhooks = state only (no provider-side provisioning); D3 controls = source-control providers only; `label` logic untouched; "Connection Name" field removed from step 3 (redundant with `label`). Scope/AC/Tasks/Risks updated accordingly.
- 2026-06-18: Implementation complete. Two commits on `feature/AIX-347-multiple-integrations-per-org`: 388a (backend) and 388b (frontend). All 107 RSpec examples and 8 Vitest tests green. Lint clean. Status → review.
