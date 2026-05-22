# Story 1.8: MCP Organization-Aware Exchange

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 user with access to multiple organizations,
I want MCP ingest-token exchange to honor an optional `X-Organization-ID` header,
so that the token is issued for the organization I am actively connecting instead of always using my oldest membership.

## Acceptance Criteria

1. `POST /api/v1/integrations/mcp/exchange` accepts an optional `X-Organization-ID` request header in addition to the existing JWT bearer auth and request body contract.
2. When `X-Organization-ID` is present and the authenticated user belongs to that organization, the exchange flow resolves that specific `OrganizationMembership` and issues the ingest token(s) against it instead of `primary_membership`.
3. When `X-Organization-ID` is absent, the endpoint remains backward-compatible and continues to resolve the oldest membership (`primary_membership`) exactly as it does today.
4. When `X-Organization-ID` is present but the authenticated user is not a member of that organization, the endpoint returns `403 Forbidden`, does not call `Mcp::IngestTokenExchangeService`, and does not create or rotate any `UserToolAccount`.
5. Authorization is evaluated against the membership selected by `X-Organization-ID` when present. On the current branch, that means `authorize! membership, to: :create?, with: UserToolAccountPolicy`; if `AIX-164` or `AIX-165` rebases in a dedicated `McpPolicy`, the same org-aware decision must be reflected there without regressing the live behavior.
6. The response body shape does not change: successful responses still render the existing `{ data: ... }` payload from `Mcp::IngestTokenExchangeService`, including `organizationId` matching the resolved membership org.
7. Request specs cover:
   - header present for a user with two memberships returns `201` and `data.organizationId` for the second org;
   - header absent falls back to `primary_membership`;
   - header present for a non-member org returns `403`;
   - existing unsupported-tool and missing-auth scenarios still behave as before.
8. Controller specs cover the membership-resolution seam directly: the controller passes the header-selected membership to `Mcp::IngestTokenExchangeService` when valid, falls back to `primary_membership` when absent, and skips the service on forbidden requests.
9. `packages/api/swagger/v1/swagger.yaml` documents `X-Organization-ID` on `/api/v1/integrations/mcp/exchange` and updates the endpoint description so it no longer claims the exchange always uses the user's oldest organization membership.
10. No regression is introduced for the multi-tool exchange flow (`tools: [...]`): the selected membership governs all requested tool accounts in the transaction, and unrelated memberships remain untouched.

## Tasks / Subtasks

- [x] Reconcile stale references before editing. (AC: 1-10)
  - [x] Treat `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb` as the live controller path; the user-provided `packages/api/app/controllers/api/v1/mcp_controller.rb` path is stale in this repo.
  - [x] Treat `UserToolAccountPolicy#create?` as the live authorization path on this branch; there is currently no `packages/api/app/policies/mcp_policy.rb`.
  - [x] If concurrent work from `AIX-164` or `AIX-165` introduces a new `McpPolicy` during rebase, preserve the current branch behavior and mirror the same org-aware membership resolution there rather than creating duplicate auth paths.

- [x] Make membership resolution header-aware in the controller. (AC: 1-5, 8)
  - [x] Add a small resolver in `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb` that reads `request.headers["X-Organization-ID"]`.
  - [x] When the header is present, resolve membership via `current_user.organization_memberships.find_by(organization_id: header_value)`.
  - [x] When no membership is found for the supplied org id, return `403` with the existing forbidden style and do not call the service.
  - [x] When the header is absent, preserve the current `primary_membership` fallback.
  - [x] Keep the controller thin: membership resolution, authorization, service call, render.

- [x] Preserve the current token-exchange contract while changing org selection. (AC: 2-4, 6, 10)
  - [x] Continue passing the resolved membership into `Mcp::IngestTokenExchangeService` without changing the service response contract.
  - [x] Ensure the selected membership controls both single-tool and multi-tool exchanges.
  - [x] Do not alter `UserToolAccount::INGEST_TOOLS`, token rotation semantics, or advisory locking behavior in this story.

- [x] Update API documentation. (AC: 1, 3, 9)
  - [x] Add optional `X-Organization-ID` documentation on the exchange endpoint via `#/components/parameters/X-Organization-ID-Optional` in `packages/api/swagger/v1/swagger.yaml` (same header name; the shared `#/components/parameters/X-Organization-ID` remains `required: true` for org-scoped routes, so a dedicated optional parameter avoids mis-documenting MCP as requiring the header).
  - [x] Rewrite the exchange endpoint description to say the header is optional, selects a specific org when provided, and falls back to oldest membership only when absent.
  - [x] Keep the request/response examples consistent with the existing `{ data: ... }` payload.

- [x] Expand backend test coverage around membership selection. (AC: 7-8, 10)
  - [x] Update `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb` with a two-membership user scenario and explicit `X-Organization-ID` headers.
  - [x] Update `packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb` to assert the resolved membership passed to the service for both header-present and header-absent cases.
  - [x] Add a forbidden spec proving the service is not called for an org outside the user's memberships.
  - [x] Keep existing happy-path, unsupported-tool, and unauthenticated coverage green.

- [x] Verify locally. (AC: 1-10)
  - [x] From `packages/api`, run `bundle exec rspec spec/requests/api/v1/integrations/mcp_spec.rb spec/controllers/api/v1/integrations/mcp_controller_spec.rb`.
  - [x] Run `bundle exec rubocop --parallel`.
  - [x] If rswag validation is part of the local workflow, confirm the Swagger change is accepted by the existing audit/check surface.

### Review Findings

- [x] [Review][Patch] Guard present-but-invalid `X-Organization-ID` before membership lookup [packages/api/app/controllers/api/v1/integrations/mcp_controller.rb:46]

## Dev Notes

### Story Source and Numbering

- Standard BMad planning artifacts are absent in this workspace: `_bmad-output/planning-artifacts/` is empty and `_bmad-output/implementation-artifacts/sprint-status.yaml` does not exist.
- Story numbering is inferred from the existing implementation-artifact chain `1-1` through `1-7`. This story is created as `1-8`.
- This story is a direct follow-up to the deferred note in Story 1.3 and the current TODO in the live controller about future `X-Organization-ID` support.

### Current Repo State

- The live controller is [`packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/integrations/mcp_controller.rb), not `packages/api/app/controllers/api/v1/mcp_controller.rb`.
- The live controller currently always resolves `membership = primary_membership`, defined as `current_user.organization_memberships.order(:created_at).first`.
- The controller currently authorizes with `authorize! membership, to: :create?, with: ::UserToolAccountPolicy` and delegates exchange behavior to [`packages/api/app/services/mcp/ingest_token_exchange_service.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/services/mcp/ingest_token_exchange_service.rb).
- `ApplicationController#set_current_organization` already understands `X-Organization-ID` for standard org-scoped requests, but the MCP exchange action does not currently use `current_organization`; it resolves membership independently.
- The request spec [`packages/api/spec/requests/api/v1/integrations/mcp_spec.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/requests/api/v1/integrations/mcp_spec.rb) currently exercises single-tool, multi-tool, unsupported-tool, and unauthenticated cases, but not explicit organization selection.
- The controller spec [`packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb) currently asserts service delegation only for the primary-membership case.
- The Swagger entry for `/api/v1/integrations/mcp/exchange` currently states that accounts are scoped to the user's oldest organization membership. That text becomes wrong once this story lands.

### Architecture Compliance

- Keep the controller thin. Do not move token-rotation behavior out of `Mcp::IngestTokenExchangeService`; this story is about membership selection and authorization context, not rewriting the exchange service.
- Every authenticated Rails action must authorize with ActionPolicy. On the current branch, the simplest correct path is still authorizing the resolved `OrganizationMembership` with `UserToolAccountPolicy#create?`.
- Follow the project rule that organization-scoped API requests depend on `X-Organization-ID`, but do not make the header mandatory here; backward compatibility is an explicit requirement.
- Preserve the current `{ data: ... }` response shape and camelCase payload keys expected by the MCP client.
- Return `403`, not `404`, when a user supplies an organization id they are not allowed to use. The distinction matters because the request identifies a real or possible org id, but access is denied.

### File-by-File Guardrails

- [`packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/integrations/mcp_controller.rb)
  - Current state: resolves `primary_membership`, authorizes it, calls `Mcp::IngestTokenExchangeService`, renders the service result.
  - This story changes: membership resolution must become header-aware.
  - Must preserve: request params contract (`tool_name`, `tools`, `device_label`), service delegation, thin-controller structure, and fallback behavior when no header is present.

- [`packages/api/app/services/mcp/ingest_token_exchange_service.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/services/mcp/ingest_token_exchange_service.rb)
  - Current state: validates requested tools, locks the resolved membership, rotates or creates tool accounts for that membership, and returns `{ data: { ingestHost, organizationId, accounts, ... } }`.
  - This story changes: likely no functional change is required if the controller passes the correct membership.
  - Must preserve: advisory lock/transaction behavior, single-tool compatibility keys, tool validation, and account scoping to exactly one membership.

- [`packages/api/spec/requests/api/v1/integrations/mcp_spec.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/requests/api/v1/integrations/mcp_spec.rb)
  - Current state: validates contract and regression coverage for exchange behavior, but assumes one membership.
  - This story changes: add explicit multi-membership scenarios and `X-Organization-ID` header coverage.
  - Must preserve: current assertions for unsupported tools, missing tool selection, unauthenticated requests, and valid external users with memberships.

- [`packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb)
  - Current state: verifies that the controller passes `primary_membership` into the service.
  - This story changes: verify header-selected membership resolution and forbidden short-circuit behavior.
  - Must preserve: service-call shape for `tool_name` and `tools`.

- [`packages/api/swagger/v1/swagger.yaml`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/swagger/v1/swagger.yaml)
  - Current state: documents the endpoint as always using the oldest membership and omits `X-Organization-ID`.
  - This story changes: add the optional header parameter and update the description text.
  - Must preserve: the existing request/response schema shape for legacy single-tool and multi-tool exchange.

### Testing Requirements

- Backend focused:
  ```bash
  cd packages/api
  bundle exec rspec spec/requests/api/v1/integrations/mcp_spec.rb spec/controllers/api/v1/integrations/mcp_controller_spec.rb
  bundle exec rubocop --parallel
  ```
- The request specs should use the existing helpers in [`packages/api/spec/support/auth_helper.rb`](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/support/auth_helper.rb), which already support passing `organization:` to attach `X-Organization-ID`.
- The two-membership request spec should assert the created `UserToolAccount` belongs to the intended `OrganizationMembership`, not just that `data.organizationId` changed.
- Add a negative assertion that the non-selected membership receives no new or rotated tool account in the forbidden case.

### Regression Risks

- Do not accidentally make `X-Organization-ID` mandatory for MCP exchange. Existing clients without the header must keep working.
- Do not rely on `current_organization` alone unless you verify the action still falls back cleanly when the header is absent; this endpoint intentionally differs from routes that require explicit org context.
- Do not change the exchange endpoint from `403` to `400` for unauthorized org ids. `400` is for malformed or missing required input, while this story's failure mode is an access check.
- Do not broaden access by resolving membership from `Organization.find(...)` without also scoping it to `current_user.organization_memberships`.
- Do not modify `Mcp::IngestTokenExchangeService` in a way that weakens multi-tool atomicity, token rotation, or response compatibility.
- Do not let Swagger continue to claim "oldest membership" unconditionally after the code changes.

### Previous Story Intelligence

- Story 1.3 explicitly deferred this exact follow-up: "If organization selection is ambiguous, prefer the oldest membership to match current behavior, but document the deferred `X-Organization-ID` follow-up."
- Story 1.3 also moved the endpoint onto `UserToolAccountPolicy#create?`; this story should build on that decision rather than reviving an old standalone MCP policy unless an in-flight rebase truly requires it.
- Story 1.5 expanded MCP exchange to support multi-tool requests via `tools: []`. This story must preserve that multi-tool flow while changing only which membership the exchange targets.
- The project context explicitly says organization-scoped requests depend on `X-Organization-ID` and warns never to assume organization context from URL alone. This story closes a known gap in that rule for MCP exchange.

### Git Intelligence

- Recent commits are all under `AIX-161` and map to the MCP epic sequence: `claude support`, `cursor support`, `Observability + resilience`, `release prepare`, and `fixed event payload`.
- That history suggests the safest implementation is a narrow backend patch that preserves the existing MCP contract rather than reopening broader auth or package-flow work.

### Latest Technical Information

- No external library or framework upgrade research is required for this story. The work is an internal Rails/API authorization and request-context adjustment using existing project patterns.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Story 1.3: MCP Keycloak Device Auth](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-3-mcp-keycloak-device-auth.md)
- [Story 1.5: MCP Cursor Sync](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md)
- [Live MCP controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/integrations/mcp_controller.rb)
- [Exchange service](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/services/mcp/ingest_token_exchange_service.rb)
- [ApplicationController org header handling](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/application_controller.rb)
- [UserToolAccountPolicy](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/policies/user_tool_account_policy.rb)
- [UserToolAccount model](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/models/user_tool_account.rb)
- [Request spec](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/requests/api/v1/integrations/mcp_spec.rb)
- [Controller spec](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb)
- [Swagger exchange endpoint](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/swagger/v1/swagger.yaml)
- [Original Task 07 plan](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/plans/npm-distribution-AIX-157/tasks/07-mcp-auth.md)

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Cursor)

### Debug Log References

### Completion Notes List

- Story created from direct user request because `_bmad-output/planning-artifacts/` is empty and `_bmad-output/implementation-artifacts/sprint-status.yaml` does not exist in this workspace.
- Story scope was narrowed to the live backend seam: header-aware membership resolution in the controller with existing service and response contract preserved.
- User-provided references to `packages/api/app/controllers/api/v1/mcp_controller.rb` and `McpPolicy` are stale relative to the current branch; the story records the live paths and describes how to handle an eventual rebase that reintroduces a policy layer.
- No sprint-status file was available to update to `ready-for-dev`.
- **Implemented:** `resolve_exchange_membership` in `McpController` (header → `organization_memberships.find_by(organization_id:)`, absent → `primary_membership`), `403` + JSON when org is not a membership, unchanged `authorize!` + `Mcp::IngestTokenExchangeService` contract.
- **Critical fix:** `skip_before_action :set_current_organization, only: :exchange` so `ApplicationController#set_current_organization` does not short-circuit MCP with `Organization not found or access denied` before the controller can apply story-specific forbidden handling and skip calling the exchange service.
- **Tests:** `docker compose exec api bundle exec rspec` on the two MCP spec files — 21 examples, 0 failures; RuboCop clean on touched Ruby files.
- **Swagger:** optional header documented via reusable `X-Organization-ID-Optional` (same header name as `X-Organization-ID`, `required: false`) to avoid marking MCP as requiring the global mandatory org header.

### Change Log

- 2026-05-21 — Story 1.8 implemented: org-aware MCP exchange, specs, Swagger optional header, `skip_before_action` for global org gate vs MCP semantics.

### File List

- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb`
- `packages/api/spec/controllers/api/v1/integrations/mcp_controller_spec.rb`
- `packages/api/swagger/v1/swagger.yaml`
- `_bmad-output/implementation-artifacts/1-8-mcp-org-aware-exchange.md`
