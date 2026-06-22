# Story AIX-347: Support multiple integrations of the same provider per organization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> Source: Jira **AIX-347** (Bug, Highest, parent epic AIX-358 "Pre-release fixes — July 1").
> In code, a Jira "integration" is an **`OrganizationConnector`** ("connector"). This story is org-scoped only.

## Story

As an **organization owner**,
I want to **connect more than one integration of the same provider** (e.g. two GitHub accounts/orgs, two GitLab instances, two Jira/Linear workspaces, or multiple OpenRouter/OpenAI keys) and manage each independently,
so that **an org that spans multiple accounts on one provider can ingest data from all of them**, instead of being blocked after the first connection.

## Scope decisions (LOCKED — do not re-litigate)

These were decided with the product owner on 2026-06-16. Treat them as requirements.

1. **Multi-instance allow-list** — multiples are permitted ONLY for these connector types:
   `github, gitlab, bitbucket, jira, linear, openrouter, openai`.
   **Single-instance retained** (still max one per org) for: `anthropic, gemini, slack, github_copilot, cursor`.
2. **Org-level only.** `project_connectors` (and its `UNIQUE (project_id, connector_type)`) are **out of scope** — do not touch.
3. **Re-auth dedup by `external_org_id`.** For OAuth providers, re-authorizing the **same** external account (same `external_org_id`) **updates** the existing connector; a **different** external account **creates** a new one.
4. **Disambiguation via a user-supplied label.** Add a nullable `label` column; surface it in the connect flow, serializer, and UI so multiple connectors of one provider are distinguishable.

## Acceptance Criteria

1. **DB constraint lifted for allow-list.** An org can persist 2+ `organization_connectors` rows of the same `connector_type` for any allow-list type. Attempting a 2nd connector of a **single-instance** type (e.g. `slack`, `anthropic`) is still rejected (model validation + DB).
2. **OAuth dedup (AC for github/gitlab/bitbucket/jira/linear):** Given an org already has a GitHub connector for external org A, when the user completes the OAuth callback for external org **B**, then a **new** connector is created (count +1). When they re-auth external org **A**, then the existing connector is **updated** (count unchanged, tokens refreshed). Dedup key = `external_org_id`.
3. **API-key multiples (openrouter/openai):** `POST .../connectors` with `connector_type: "openrouter"` succeeds even when an openrouter connector already exists; both rows persist. A `label` may be supplied to tell them apart. (These have no `external_org_id`, so dedup-by-account does not apply — each successful create is a new row.)
4. **Label round-trips.** A `label` provided on connect (OAuth callback or API-key create) is persisted, returned by `OrganizationConnectorSerializer`, editable via `PATCH .../connectors/:id`, and shown on the integration card in the UI.
5. **AI usage sync covers all matching connectors.** `AiUsageSyncJob` reconciles **every** active `openrouter`/`openai` connector in an org (not just the first). No connector is silently skipped.
6. **Available-tab UI shows allow-list providers even when connected.** On `/integrations/available`, an allow-list provider (e.g. GitHub) **still appears** with a Connect action after one connection exists; a single-instance provider (e.g. Slack) is **hidden** once connected, as today.
7. **Connected-tab UI lists every connector.** All connectors of a provider render as separate cards on `/integrations/connected`, each with its own label/account name and its own sync/test/disconnect actions.
8. **No regression for single-instance providers.** Slack/Anthropic/Gemini/Copilot/Cursor behavior is unchanged (still one per org; their downstream `.first` selections remain correct).
9. **Swagger in sync.** `packages/api/swagger/v1/swagger.yaml` reflects the new `label` field on connector request/response schemas and the changed callback semantics. No drift.
10. **Migration is reversible** and safe on existing data (no duplicate rows exist today, so the down path can restore the original unique index).

## Tasks / Subtasks

- [x] **DB migration — lift constraint, add dedup + label** (AC: 1, 2, 3, 10)
  - [x] Drop unique index `idx_on_organization_id_connector_type_ebd5fb8c77` on `organization_connectors (organization_id, connector_type)`.
  - [x] Add a **partial** unique index enforcing single-instance types only:
    `UNIQUE (organization_id, connector_type) WHERE connector_type NOT IN ('github','gitlab','bitbucket','jira','linear','openrouter','openai')`. (`connector_type` is the `public.connector_type` enum — `NOT IN` with enum literals is valid.)
  - [x] Add a **partial** unique index for OAuth dedup:
    `UNIQUE (organization_id, connector_type, external_org_id) WHERE external_org_id IS NOT NULL`. This enforces decision #3 at the DB level (openrouter/openai have null `external_org_id`, so they are unaffected → multiples allowed).
  - [x] Add column `label :string` (nullable) to `organization_connectors`.
  - [x] Ensure `down` re-adds the original unique index and drops the new ones + `label`. Reversible.
- [x] **Model — `OrganizationConnector`** (AC: 1, 4) — `app/models/organization_connector.rb`
  - [x] Add `MULTI_INSTANCE_CONNECTOR_TYPES = %w[github gitlab bitbucket jira linear openrouter openai].freeze` and a `multi_instance?` predicate.
  - [x] Replace the unconditional `validates :connector_type, uniqueness: { scope: :organization_id }` (line 21) with a **conditional** one: `..., uniqueness: { scope: :organization_id, message: "already exists for this organization" }, unless: :multi_instance?`.
  - [x] (Optional, mirrors DB) For OAuth multi types add `validates :external_org_id, uniqueness: { scope: [:organization_id, :connector_type] }, if: -> { multi_instance? && external_org_id.present? }` so app-level errors are friendly.
- [x] **Controller — `OrganizationConnectorsController`** (AC: 2, 3, 4) — `app/controllers/api/v1/organization_connectors_controller.rb`
  - [x] `callback` (lines 274–286): change the lookup so multi-instance OAuth types dedup on `external_org_id`. After `exchange_code`, resolve `external_org_id = token_data[:account_id]`. Then:
    `connector = multi_instance ? orgs.find_or_initialize_by(connector_type:, external_org_id:) : orgs.find_or_initialize_by(connector_type:)`. Keep the existing assign/save/audit flow.
  - [x] `create` (line 28): no logic change needed for multiples (uniqueness now conditional → second openrouter/openai persists), but permit `label`.
  - [x] Permit `:label` in `connector_params` and `connector_update_params`.
- [x] **Serializer** (AC: 4) — `app/serializers/organization_connector_serializer.rb`: add `attribute :label`.
- [x] **Downstream fan-out fixes** (AC: 5, 8)
  - [x] `AiUsageSyncJob#reconcile_organization` (`app/jobs/ai_usage_sync_job.rb:58`): change `find_by(connector_type: provider, is_active: true)` → iterate `where(connector_type: provider, is_active: true).find_each { |c| reconcile_provider(...) }` and sum. **See Risk R1** — flag the dedup-key collision before assuming this is fully correct for 2× openrouter/openai in one org.
  - [x] `AiGatewayController` (`app/controllers/api/v1/ai_gateway_controller.rb:96`): `.where(...).first` is now ambiguous for openrouter/openai. **Default:** keep `.first` but order deterministically (e.g. `.order(:created_at).first`) and add a TODO referencing R2. Do **not** silently change proxy routing without product sign-off.
  - [x] **Slack** (`app/services/slack/notification_service.rb:12`, `project_notification_service.rb:12`): **NO CHANGE** — slack is single-instance; `.first` stays correct. (Listed here so the dev doesn't "fix" it.)
- [x] **Routes/Swagger** (AC: 9): no route changes (endpoints unchanged). Update `swagger.yaml`: add `label` to connector request bodies (`create`, `callback`, `update`) and to the response schema; note callback dedup behavior in the description.
- [x] **Frontend — Available/Connected tabs** (AC: 6, 7) — `packages/web/src/pages/Integrations.tsx:184-205`
  - [x] Add a `multiInstance` flag to the provider catalog (`packages/web/src/lib/providers.ts`) for github/gitlab/bitbucket/jira/linear/openrouter/openai (mirror the backend allow-list).
  - [x] Change the available-tab filter: hide a provider only if it is connected **AND not** `multiInstance`. Multi-instance providers always remain in Available with a Connect action. Update the `Available (n)` count accordingly.
  - [x] Connected tab already maps one card per connector — verify multiple cards of one provider render (no provider-keyed dedup in the connected loop).
- [x] **Frontend — label (set at connect time)** (AC: 4) — add `label` to `Connector` (`src/lib/types.ts`) and `IntegrationData` (`src/components/integrations/IntegrationCard.tsx`); render it on the connected card; add an optional label input to the connect flows (`IntegrationSetup.tsx` for OAuth, `ApiKeyConnectSheet.tsx` for API-key providers); pass `label` through `useCreateConnector`/`useConnectWithApiKey` (`src/hooks/useApi.ts`).
- [x] **Frontend — label (edit after connect)** (AC: 4) — currently `label` is rendered (`IntegrationCard.tsx:221`) but there is no way to change it on an existing connector. Add a "Rename" action:
  - [x] Add a **"Rename"** item to the connected card's dropdown menu (`IntegrationCard.tsx`, in the `DropdownMenuContent` alongside Sync/Test/Disconnect). Conditionally show only when `integration.label !== undefined` or connector is multi-instance (always useful for disambiguation).
  - [x] On click: open an inline popover or small `Dialog` with a single `<Input>` pre-filled with the current label (or empty string). Use existing shadcn/ui `Dialog`/`Popover` + `Input` primitives — do not add new UI deps.
  - [x] On confirm: call `useUpdateConnector({ orgId, connectorId: integration.id, data: { label: newLabel } })`. On success the query invalidation already refreshes the card.
  - [x] Pass `onRename?: (id: string, newLabel: string) => void` (or wire `useUpdateConnector` directly inside the card, same pattern as `onSync`/`onDisconnect`) through `IntegrationCardProps` — choose whichever is consistent with the existing action pattern.
  - [x] `Integrations.tsx`: wire the handler the same way `onSync`/`onTest`/`onDisconnect` are wired.
  - [x] Test: in `IntegrationCard.test.tsx` assert the Rename item appears in the menu and calls the update; in `Integrations.test.tsx` assert the wired handler calls `useUpdateConnector`.
- [x] **Tests** (AC: all) — see Testing requirements below.
- [x] **Verification:** `make lint-api`, `make lint-web`; RSpec for model/request/job; Vitest for Integrations + IntegrationCard; full API suite green in Docker.

### Review Findings

- [x] [Review][Patch] Make AI usage dedup connector-scoped for multi-instance providers [packages/api/app/jobs/ai_usage_sync_job.rb:84]
- [x] [Review][Patch] Add fail-fast rollback guard when duplicate multi-instance rows exist [packages/api/db/migrate/20260616120937_allow_multiple_connectors_per_provider.rb:31]
- [x] [Review][Patch] OAuth callback should not fallback to type-only dedup when `external_org_id` is missing [packages/api/app/controllers/api/v1/organization_connectors_controller.rb:273]
- [x] [Review][Patch] Normalize blank `external_org_id` before validation/index checks to avoid model/DB mismatch [packages/api/app/models/organization_connector.rb:22]
- [x] [Review][Patch] Add request-spec coverage for 422 when OAuth callback omits `external_org_id` for multi-instance providers [packages/api/spec/requests/api/v1/organization_connectors_spec.rb]
- [x] [Review][Patch] Strengthen OAuth callback test to assert real `external_org_id A -> B` create path (not `nil -> B`) [packages/api/spec/requests/api/v1/organization_connectors_spec.rb]
- [x] [Review][Patch] Add `openai` multi-connector reconciliation coverage alongside existing `openrouter` job spec [packages/api/spec/jobs/ai_usage_sync_job_spec.rb]
- [x] [Review][Patch] Make label input available for single-instance providers at connect time (decision: apply to all providers) [packages/web/src/pages/IntegrationSetup.tsx]
- [x] [Review][Patch] Prevent silent rename failures by keeping dialog open and showing user-visible error when update fails [packages/web/src/components/integrations/IntegrationCard.tsx]
- [x] [Review][Patch] Normalize label display so whitespace-only labels fallback to account name instead of rendering an empty badge [packages/web/src/components/integrations/IntegrationCard.tsx]
- [x] [Review][Patch] Add frontend tests for rename failure path and whitespace/trimmed label behavior [packages/web/src/components/integrations/IntegrationCard.test.tsx]

## Dev Notes

### Business context

Today an org can connect exactly **one** connector per provider. The hard stop is a `UNIQUE (organization_id, connector_type)` index plus a model uniqueness validation; the UI independently hides any already-connected provider from the Available tab. Orgs that operate multiple accounts on one provider (two GitHub orgs, two Jira sites, multiple OpenRouter keys) cannot onboard the second account at all.

### Root-cause map (current state — verified by reading the code)

| # | Location | Current behavior | Change |
|---|----------|------------------|--------|
| 1 | `db/structure.sql:11978` index `idx_on_organization_id_connector_type_ebd5fb8c77` (migration `20260125224617_create_organization_connectors.rb:21`) | hard `UNIQUE (organization_id, connector_type)` | Drop; replace with partial indexes (Task 1) |
| 2 | `app/models/organization_connector.rb:21` | unconditional uniqueness validation | Make conditional on `multi_instance?` |
| 3 | `organization_connectors_controller.rb:274-275` | `find_or_initialize_by(connector_type:)` → always one row | Dedup on `external_org_id` for multi OAuth types |
| 4 | `Integrations.tsx:184-205` | `connectedProviders` Set hides any connected provider from Available | Hide only single-instance connected providers |
| 5 | `Integrations.test.tsx:211-219` | asserts connected providers disappear from Available | Update: multi-instance stay; single-instance hide |

### Downstream "pick first" assumptions (will silently mis-select once multiples exist)

| Location | Provider relevance | Action |
|----------|--------------------|--------|
| `ai_usage_sync_job.rb:58` `find_by(... )` | openrouter, openai (multi) | **Iterate all** active matches (Task: fan-out) |
| `ai_gateway_controller.rb:96-98` `.where(...).first` | openrouter, openai (multi) | Deterministic `.first` + TODO; see R2 |
| `slack/notification_service.rb:12`, `slack/project_notification_service.rb:12` `.first` | slack (single) | **No change** — stays correct |

### Architecture compliance (project-context.md)

- **Schema:** edits go through a reversible migration in `db/migrate/`; `structure.sql` regenerates. **Never** drop a column in the same migration that removes its usage — `label` is additive so this is moot, but keep the constraint changes reversible.
- **`connector_type` is a PG enum** (`public.connector_type`), not varchar. Index predicates use enum string literals.
- **Dual columns exist:** the model/callback write `external_org_id`/`external_org_name`; the serializer maps `external_account_id`/`external_account_name` → the `external_org_*` columns (lines 8-14). Use **`external_org_id`** as the dedup key (it's what the callback populates). Do not introduce a third identity column.
- **Authorization:** `OrganizationConnectorPolicy` is per-record + org-scoped (owner for writes). No per-provider assumption → **no policy change**. Keep `authorize!` calls intact.
- **Serializer:** Alba `BaseSerializer` lower-camelCases keys → `label` surfaces as `label`. Never expose tokens (existing rule).
- **Swagger mandatory:** controller/response shape changed (`label`) → update `swagger.yaml` in the same commit (hard gate; `swagger-auditor`).
- **Frontend:** use the shared API client + TanStack Query hooks (`useConnectors`, `useCreateConnector`, `useConnectWithApiKey`); query key `["organizations", orgId, "connectors"]` already returns an array → supports multiples with no hook change. Reuse the existing `IntegrationCard` (it is data-agnostic). No inline numeric formatting involved.

### File structure

| Action | Path |
|--------|------|
| NEW | `packages/api/db/migrate/<ts>_allow_multiple_connectors_per_provider.rb` |
| UPDATE | `packages/api/app/models/organization_connector.rb` |
| UPDATE | `packages/api/app/controllers/api/v1/organization_connectors_controller.rb` |
| UPDATE | `packages/api/app/serializers/organization_connector_serializer.rb` |
| UPDATE | `packages/api/app/jobs/ai_usage_sync_job.rb` |
| UPDATE | `packages/api/app/controllers/api/v1/ai_gateway_controller.rb` |
| UPDATE | `packages/api/swagger/v1/swagger.yaml` |
| UPDATE | `packages/web/src/lib/providers.ts` |
| UPDATE | `packages/web/src/pages/Integrations.tsx` |
| UPDATE | `packages/web/src/lib/types.ts` |
| UPDATE | `packages/web/src/components/integrations/IntegrationCard.tsx` |
| UPDATE | `packages/web/src/pages/IntegrationSetup.tsx` |
| UPDATE | `packages/web/src/components/integrations/ApiKeyConnectSheet.tsx` |
| UPDATE | `packages/web/src/hooks/useApi.ts` |
| UPDATE (tests) | `spec/models/organization_connector_spec.rb`, `spec/requests/api/v1/organization_connectors_spec.rb`, `spec/jobs/ai_usage_sync_job_spec.rb` (or existing), `packages/web/src/pages/Integrations.test.tsx`, `IntegrationCard.test.tsx` |

> **Sizing note:** this touches API + web + 3 subsystems and likely exceeds the per-task budget. If the dev session approaches compaction, split into **`347a` backend (migration + model + controller + serializer + downstream + swagger + API specs)** and **`347b` frontend (providers/Integrations/card/setup/hooks + Vitest)** on the **same branch**, one commit each, one PR — per the CLAUDE.md split rule.

### Testing requirements

- **Model spec** (`organization_connector_spec.rb`): the existing uniqueness test (lines 31-36) must be **rewritten** — a 2nd `github` is now valid; a 2nd `slack` is still invalid; same-`external_org_id` github is rejected, different `external_org_id` is allowed.
- **Request spec** (`organization_connectors_spec.rb`): callback (around lines 660-670, "updates an existing connector") must be **split**: same `external_org_id` → update (count unchanged); new `external_org_id` → create (count +1). Add: `POST /connectors` twice for `openrouter` → both persist; `label` round-trips on create + PATCH.
- **Job spec:** two active `openrouter` connectors in one org → both reconciled (assert each `mark_synced!`/reconcile invoked). Cover R1 expectation explicitly so the dedup risk is visible in tests.
- **No DB mocking** in request/job specs — real DB + FactoryBot transactions. Org/connector factories exist.
- **Frontend:** update `Integrations.test.tsx:211-219` — GitHub (multi) still shows in Available after a connector exists; Slack (single) hidden. Add a test that 2 GitHub connectors render 2 connected cards. `IntegrationCard.test.tsx`: label renders when present.

### Risks / open items (not blockers — surface in PR)

- **R1 — AI usage dedup collision (important).** `connector_event_dedup` and `tool_events` are keyed by `(organization_id, tool_name, …)` with `tool_name = "openrouter_api"` / `"openai_api"` — **not** per-connector. Two openrouter (or openai) connectors in one org will write into the **same** `tool_name` namespace, so usage from connector B may dedup against connector A's events and cost attribution between the two becomes ambiguous. Fanning out the sync (Task 5) makes both *run*, but does not disambiguate their data. **Decision needed:** either (a) accept aggregate-per-provider cost for MVP (document it), or (b) scope dedup/`tool_name` by connector — a larger change, likely a follow-up ticket. Search Jira before filing; link AIX-358.
- **R2 — AI gateway connector selection.** `AiGatewayController` proxies chat/completions and picks one connector via `.first`. With multiple openrouter/openai it cannot know which key to use. MVP default: deterministic `.first` (oldest active). A proper fix (accept `connector_id` / org default) is a separate concern — do not expand this story's API surface without product sign-off.

### Project context reference

See `_bmad-output/project-context.md`: run Rails commands from `packages/api/`; ActionPolicy `authorize!`; Alba serializers; reversible migrations; swagger sync is a hard gate; frontend goes through the shared API client + TanStack Query; double-quote TS, no `any`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (claude-sonnet-4-6)

### Debug Log References

None — clean implementation with no significant detours.

### Completion Notes List

- Migration `20260616120937_allow_multiple_connectors_per_provider.rb` created and applied: drops old blanket UNIQUE index, adds two partial indexes (single-instance enforcement + OAuth dedup), adds `label` column.
- `OrganizationConnector` model: added `MULTI_INSTANCE_CONNECTOR_TYPES` constant, `multi_instance?` predicate, conditional uniqueness validations.
- `OrganizationConnectorsController#callback`: deduplication now uses `external_org_id` for multi-instance OAuth types. Same external account → update; new external account → create. `label` permitted in all params methods.
- `OrganizationConnectorSerializer`: `label` attribute added.
- `AiUsageSyncJob#reconcile_organization`: changed from `find_by` (first match only) to `where(...).find_each` — fans out over all active connectors per provider. R1 risk (shared tool_name namespace) documented in PR.
- `AiGatewayController`: deterministic `.order(:created_at).first` with R2 TODO comment.
- Swagger updated: `label` in create/update/callback request bodies and OrganizationConnector response schema; callback description notes dedup behavior.
- Frontend (`providers.ts`): `multiInstance: true` on github/gitlab/bitbucket/jira/linear/openrouter/openai.
- Frontend (`Integrations.tsx`): available-tab filter now uses `p.multiInstance || !connectedProviders.has(p.id)`. Label passed through integrations mapping.
- Frontend (`IntegrationCard.tsx`): `label` in `IntegrationData`; renders label (preferred) or account_name on connected card.
- Frontend (`useApi.ts`): optional `label` in `useCreateConnector` and `useConnectWithApiKey`.
- Frontend (`IntegrationSetup.tsx`): label input on authorize step for multi-instance OAuth providers; `ProviderConfig.multiInstance` field added; `multiInstance: true` on github/gitlab/bitbucket/jira/linear.
- Frontend (`ApiKeyConnectSheet.tsx`): optional label input shown for multi-instance providers.
- All tests updated and new tests added. Full suites: 2563 RSpec + 709 Vitest — 0 failures.

### File List

- packages/api/db/migrate/20260616120937_allow_multiple_connectors_per_provider.rb (NEW)
- packages/api/app/models/organization_connector.rb
- packages/api/app/controllers/api/v1/organization_connectors_controller.rb
- packages/api/app/serializers/organization_connector_serializer.rb
- packages/api/app/jobs/ai_usage_sync_job.rb
- packages/api/app/controllers/api/v1/ai_gateway_controller.rb
- packages/api/swagger/v1/swagger.yaml
- packages/api/db/structure.sql
- packages/api/spec/models/organization_connector_spec.rb
- packages/api/spec/requests/api/v1/organization_connectors_spec.rb
- packages/api/spec/jobs/ai_usage_sync_job_spec.rb
- packages/web/src/lib/providers.ts
- packages/web/src/lib/types.ts
- packages/web/src/pages/Integrations.tsx
- packages/web/src/pages/IntegrationSetup.tsx
- packages/web/src/components/integrations/IntegrationCard.tsx
- packages/web/src/components/integrations/ApiKeyConnectSheet.tsx
- packages/web/src/hooks/useApi.ts
- packages/web/src/pages/Integrations.test.tsx
- packages/web/src/components/integrations/IntegrationCard.test.tsx

### Change Log

- 2026-06-16: Story drafted from AIX-347 with exhaustive backend+frontend connector analysis; scope decisions locked with product (multi-instance allow-list, org-only, dedup-by-external_org_id, user label).
- 2026-06-16: Full implementation complete — migration, model, controller, serializer, job fan-out, gateway determinism, swagger, frontend providers/filter/label/connect-flows + all tests. Status → review.
