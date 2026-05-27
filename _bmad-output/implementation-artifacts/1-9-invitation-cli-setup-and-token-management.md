# Story 1.9: Invitation CLI Setup and Self-Serve Ingest Token Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a newly connected DB90 user,
I want clear post-invitation setup guidance and a place to manage my ingest tokens,
so that I can finish linking my AI tools and recover or rotate credentials without admin help.

## Acceptance Criteria

1. After a successful invitation acceptance in `packages/web/src/pages/InvitationAccept.tsx`, the user is no longer silently redirected to `/`.
2. Instead, the page shows a success-state "Get started" card that confirms the account is connected and tells the user to link their AI tools next.
3. The card includes a copyable command block with `npm install -g @db90/cli-claude && db90 login`.
4. The card includes a "Continue to dashboard" action that navigates to `/`, and the accepted organization is still set as current org before navigation.
5. Settings → Tools shows an "Ingest tokens" section for the current user's ingest-capable tool accounts, including at minimum:
   - tool name
   - created date
   - last-used date
   - copy-token action
   - rotate-token action
6. Users with no ingest-capable tool accounts see an empty state in Settings → Tools with setup guidance that points them at the CLI/MCP onboarding path instead of a blank table.
7. Rotating a token from the UI uses the existing `POST /api/v1/integrations/mcp/exchange` flow, invalidates the old token, and reveals the new token exactly once in the response-driven UI state.
8. The new read endpoint for Settings token management does not expose the persisted token value in its normal list response; only create/rotate flows may return the one-time token.
9. Backend API adds a documented authenticated endpoint under `/api/v1/users/me/...` that returns the current user's tool-account metadata needed by the Settings screen, honoring org context via the shared API client's `X-Organization-ID` header.
10. Request specs cover the new metadata endpoint, including current-user scoping and token non-disclosure, and frontend tests cover the invitation success card plus the Settings Tools empty and populated states.

## Tasks / Subtasks

- [x] Replace the silent invitation success redirect with a setup card. (AC: 1-4)
  - [x] Update `packages/web/src/pages/InvitationAccept.tsx` so successful acceptance sets success state without starting the 1.5-second redirect timer.
  - [x] Preserve the existing `refreshOrganizations()` call and set the accepted org as current org before any manual navigation to `/`.
  - [x] Add a focused success card with:
    - [x] success confirmation copy
    - [x] setup guidance text
    - [x] copyable command block for `npm install -g @db90/cli-claude && db90 login`
    - [x] "Continue to dashboard" button
  - [x] Keep existing not-found, expired, revoked, already-accepted, and unauthenticated flows intact.

- [x] Add self-serve ingest token management to Settings → Tools. (AC: 5-7)
  - [x] Update `packages/web/src/pages/UserSettings.tsx` so the Tools route includes an "Ingest tokens" section instead of relying only on the generic `ToolAccounts` connect/disconnect UI.
  - [x] Reuse the current-org context already provided by the shared API client; do not introduce ad hoc auth or fetch logic.
  - [x] Show ingest token rows only for ingest-capable tools (`claude_code`, `cursor`) unless product explicitly wants non-ingest accounts displayed in the same section.
  - [x] For each row, show tool name, created date, computed last-used date, and actions for copy + rotate.
  - [x] When rotate succeeds, reveal the new token in the UI once, provide copy affordance, and explain that the old token is no longer valid.
  - [x] Add an empty state with setup copy and the recommended onboarding command/path.

- [x] Add frontend API hooks and types for the new Settings surface. (AC: 5-7, 9)
  - [x] Add `useMyToolAccounts` to `packages/web/src/hooks/useApi.ts`.
  - [x] Add the matching query key under `queryKeys.user`.
  - [x] Add or extend the frontend response type in `packages/web/src/lib/types.ts` for tool-account metadata that includes `createdAt`, `lastUsedAt`, and one-time `ingestToken` when rotation returns it.
  - [x] If needed for clean composition, add a dedicated rotation mutation hook in `useApi.ts` rather than posting directly from the component with raw `fetch`.

- [x] Add a user-scoped tool-account metadata endpoint in Rails. (AC: 8-9)
  - [x] Add a `tool_accounts` action to `packages/api/app/controllers/api/v1/users_controller.rb` or introduce a tightly scoped controller under the same `/users/me/...` namespace if that fits the repo better.
  - [x] Authorize the action with ActionPolicy.
  - [x] Scope records to the authenticated user's membership in the current organization from `X-Organization-ID`.
  - [x] Return token metadata without exposing `access_token`, `refresh_token`, token hash, or plaintext ingest token.
  - [x] Include enough information for the Settings screen to render created date, last-used date, and tool display name.

- [x] Decide and implement the source of truth for "last used". (AC: 5, 9)
  - [x] Confirm whether `user_tool_accounts` already stores a usable last-used timestamp. In the current branch it does not.
  - [x] Prefer deriving `lastUsedAt` from `ToolEvent` activity keyed by organization + user + `tool_name`, because ingest currently stamps those trusted fields from the authenticating `UserToolAccount`.
  - [x] If a persisted `last_used_at` column is introduced instead, add migration, write path, serializer/docs/specs, and explain why derived query logic was insufficient.
  - [x] Do not invent a fake placeholder date or silently use `updated_at` as "last used".

- [x] Wire rotation through the existing MCP exchange endpoint. (AC: 7)
  - [x] Reuse `POST /api/v1/integrations/mcp/exchange` with the authenticated dashboard JWT and the selected ingest tool name.
  - [x] Keep current MCP response compatibility intact.
  - [x] Ensure the frontend handles the one-time token from the exchange response and refreshes list metadata afterward.
  - [x] Do not add a second bespoke rotation endpoint unless a concrete technical blocker makes MCP exchange unusable for this flow.

- [x] Update routes, Swagger, and tests. (AC: 8-10)
  - [x] Add the new `/api/v1/users/me/tool_accounts` route in `packages/api/config/routes.rb`.
  - [x] Document it in `packages/api/swagger/v1/swagger.yaml` in the same change.
  - [x] Add/update request specs for the new endpoint.
  - [x] Add/update frontend tests for `InvitationAccept.tsx` and `UserSettings.tsx`.

### Review Findings

- [x] [Review][Patch] Bind Settings token metadata and rotation requests to the selected org [packages/web/src/hooks/useApi.ts:1434]
- [x] [Review][Patch] Select the rotated token by tool name before revealing it [packages/web/src/pages/SettingsToolsSection.tsx:28]
- [x] [Review][Patch] Handle rotation failures without an unhandled rejected promise [packages/web/src/pages/SettingsToolsSection.tsx:69]
- [x] [Review][Patch] Guard invalid date strings before rendering Settings token dates [packages/web/src/pages/SettingsToolsSection.tsx:36]
- [x] [Review][Patch] Add request coverage excluding another user's same-org ingest account [packages/api/spec/requests/api/v1/users_spec.rb:112]
- [x] [Review][Patch] Assert the Settings Tools empty-state onboarding guidance [packages/web/src/pages/UserSettings.test.tsx:282]

## Dev Notes

### Story Source and Numbering

- Standard BMad planning artifacts are absent in this workspace: `_bmad-output/planning-artifacts/` is empty and `_bmad-output/implementation-artifacts/sprint-status.yaml` does not exist.
- Story numbering is inferred from the existing implementation-artifact chain `1-1` through `1-8`. This story is created as `1-9`.
- The story is derived from the user-provided feature brief and the already-landed MCP/tool-account story chain.

### Business Context

- The current invitation-accept flow leaves a user in a confusing state: success is real, but the next required action (`db90 login`) is invisible.
- The current Settings Tools route is optimized for linking generic tool accounts, not for self-serve lifecycle management of ingest credentials.
- The feature closes two onboarding gaps:
  - post-invite activation guidance
  - post-activation credential recovery and rotation

### Current Repo State

- `packages/web/src/pages/InvitationAccept.tsx` currently accepts the invitation, refreshes organizations, sets `acceptSuccess`, and starts a `setTimeout` that redirects to `/` after 1500 ms.
- The current success state says "Redirecting you to your profile..." and shows only a spinner. There is no setup command or explicit next step.
- `packages/web/src/pages/UserSettings.tsx` currently routes `/profile/tools` to `<ToolAccounts embedded />`.
- `packages/web/src/pages/ToolAccounts.tsx` is a generic linked-account management screen with org selection, connect/disconnect, enable/disable, and reconnect flows. It does not expose ingest-token copy/rotate UX.
- `packages/web/src/hooks/useApi.ts` already has org-scoped tool-account hooks for `/organizations/:organization_id/tool_accounts` and `regenerate_token`, but no current-user metadata hook for the Settings experience.
- `packages/api/app/controllers/api/v1/users_controller.rb` currently exposes `me`, `update`, `organizations`, `favorites`, `settings`, and impersonation actions. There is no `tool_accounts` action yet.
- `packages/api/app/controllers/api/v1/user_tool_accounts_controller.rb` already returns one-time `ingestToken` on create and `regenerate_token`, and request specs already assert that the old token becomes unauthorized after rotation.
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb` already rotates or creates ingest accounts for `claude_code` and `cursor` and returns one-time `ingestToken` data.
- `packages/api/app/serializers/user_tool_account_serializer.rb` intentionally excludes token values and currently serializes metadata such as `tool_name`, `is_active`, `token_expires_at`, timestamps, and scope.
- `packages/api/app/models/user_tool_account.rb` defines `INGEST_TOOLS = %w[claude_code cursor]` and supports token rotation via `rotate_ingest_token!`.
- `packages/api/app/controllers/api/v1/ingest_controller.rb` stamps `organization_id`, `user_id`, and `tool_name` from the authenticating `UserToolAccount`, which makes `ToolEvent` the most reliable existing source for "last used" if no account-level timestamp exists.

### Architecture Compliance

- Follow the shared frontend API-client rule. Do not use raw `fetch`; use `api` and TanStack Query hooks in `useApi.ts`.
- Every authenticated Rails controller action must authorize with ActionPolicy.
- Any route/controller change under `packages/api` must update `packages/api/swagger/v1/swagger.yaml` in the same change.
- Keep controllers thin. If computing last-used metadata needs query logic beyond a trivial join/aggregate, prefer a dedicated query/service object over bloating `UsersController`.
- Preserve the standard `{ data: ... }` response shape.
- Respect org context via the shared `X-Organization-ID` header. This Settings screen is user-facing, but the underlying tool accounts are still membership/org scoped.

### File-by-File Guardrails

- `packages/web/src/pages/InvitationAccept.tsx`
  - Current state: state-driven invitation UI with success redirect timer.
  - This story changes: success state becomes an actionable onboarding card.
  - Must preserve: invitation lookup, accept flow, org refresh, org selection, and all non-success render states.

- `packages/web/src/pages/UserSettings.tsx`
  - Current state: routes `/profile/tools` to the embedded `ToolAccounts` page.
  - This story changes: the Tools route needs an ingest-token management surface, likely alongside or above the existing generic tool-account management UI.
  - Must preserve: existing route structure, sidebar active state, and the rest of the settings sections.

- `packages/web/src/pages/ToolAccounts.tsx`
  - Current state: generic connect/disconnect and enable/disable management for many providers.
  - This story changes: maybe none directly, but the new Settings Tools experience should reuse its existing patterns where sensible instead of duplicating provider catalogs or org-selection logic carelessly.
  - Must preserve: current connect/disconnect behavior for non-ingest tools unless the product explicitly replaces that screen.

- `packages/web/src/hooks/useApi.ts`
  - Current state: org-scoped tool-account hooks and `useRegenerateIngestToken` exist; no user-scoped metadata hook exists.
  - This story changes: add `useMyToolAccounts`, and optionally a small mutation hook for MCP exchange-based rotation if that keeps UI logic clean.
  - Must preserve: query invalidation patterns and the shared query-key structure.

- `packages/web/src/lib/types.ts`
  - Current state: `ToolAccount` supports one-time `ingestToken`, but there is no separate shape for "current user's ingest token metadata with last used".
  - This story changes: add a type that models the new endpoint and the once-only rotate response.
  - Must preserve: current typing for org-scoped tool-account pages and existing integrations UI.

- `packages/api/app/controllers/api/v1/users_controller.rb`
  - Current state: user profile/settings controller with no tool-account listing action.
  - This story changes: add a user-scoped metadata action or delegate to a focused controller under the same namespace.
  - Must preserve: existing user endpoints, response shapes, and thin-controller discipline.

- `packages/api/config/routes.rb`
  - Current state: has `/users/me`, `/users/me/organizations`, `/users/me/settings`, but no `/users/me/tool_accounts`.
  - This story changes: add the route under the existing user block.
  - Must preserve: route ordering and existing namespace conventions.

- `packages/api/swagger/v1/swagger.yaml`
  - Current state: documents `/users/me`, `/users/me/organizations`, and org-scoped `/organizations/{organization_id}/tool_accounts`, plus `/integrations/mcp/exchange`.
  - This story changes: add the new user-scoped endpoint and ensure token secrecy is explicit in docs.
  - Must preserve: current MCP exchange contract and existing org-scoped tool-account docs.

### Last-Used Date Guardrail

- `user_tool_accounts` currently has `created_at`, `updated_at`, and `token_expires_at`, but no `last_used_at`.
- Do not label `updated_at` as "last used". Rotation, enable/disable, or metadata edits would make that misleading.
- The safest no-migration approach is to compute `lastUsedAt` from the latest `ToolEvent.occurred_at` for the authenticated user's current-org membership and matching `tool_name`.
- If query performance becomes a concern, document the tradeoff and add a dedicated follow-up rather than hiding a weak approximation in this story.

### Rotation Guardrail

- The user explicitly asked to reuse `POST /api/v1/integrations/mcp/exchange` for rotation.
- That endpoint already returns one-time token material and already supports `claude_code` and `cursor`.
- Use the endpoint for ingest-tool rotation rather than adding another plaintext-token list endpoint.
- After rotate, show the new token immediately, allow copy, and make clear that it will not be recoverable from the standard list later.

### Testing Requirements

- Frontend:
  - Add or update `InvitationAccept` tests to verify the success card and command text appear after acceptance instead of auto-redirect messaging.
  - Update `UserSettings` tests for the Tools route to cover:
    - populated ingest-token state
    - empty state
    - visible rotate/copy affordances
  - If the token reveal is extracted into a child component, add focused component tests there as well.

- Backend:
  - Add request specs for `GET /api/v1/users/me/tool_accounts`.
  - Assert the response is limited to the authenticated user's current-org membership.
  - Assert token values are not present in the list response.
  - If `lastUsedAt` is derived from `ToolEvent`, add coverage proving the correct max event is selected.
  - Keep existing rotation guarantees green:
    - old token rejected after rotation
    - new token accepted

- Relevant commands:
  ```bash
  cd packages/web
  npm test -- UserSettings
  npm test -- InvitationAccept

  cd packages/api
  bundle exec rspec spec/requests/api/v1/user_tool_accounts_spec.rb
  bundle exec rspec spec/requests/api/v1/users_spec.rb
  bundle exec rubocop --parallel
  ```
  - Adjust exact spec file names if the new endpoint gets its own request spec file.

### Regression Risks

- Do not reintroduce an automatic redirect on invitation success that prevents the user from copying the setup command.
- Do not expose persisted token values from the new list endpoint.
- Do not compute "last used" from the wrong org, wrong user, or wrong tool name.
- Do not bypass current-org header handling; the Settings view should respect the same org context as the rest of the app.
- Do not break the existing `ToolAccounts` embedded route for non-ingest provider management unless the replacement UX fully covers those needs.
- Do not create a second rotation path with different semantics from MCP exchange unless unavoidable and documented.

### Previous Story Intelligence

- Story 1.3 introduced `POST /api/v1/integrations/mcp/exchange` as the authenticated JWT-to-ingest-token exchange path and established the rule that the durable credential is the DB90 ingest token, not the IdP token.
- Story 1.5 expanded MCP exchange to support multiple ingest tools (`claude_code`, `cursor`) atomically and confirmed the endpoint is the right place for ingest-account provisioning and rotation behavior.
- Story 1.7 added an `MCP (recommended)` setup path in the dashboard integration sheet and reinforced that token copy is no longer the only onboarding path; this story should align its copy with that newer recommended setup.
- Story 1.8 made MCP exchange org-aware via optional `X-Organization-ID`, which matters here because Settings token management should reflect the active organization context instead of an arbitrary membership.

### Git Intelligence Summary

- Recent repo history after the MCP epic includes:
  - `0b58426` merge of a `db90 login` fix
  - `22a9baa` CLI connection status badge work
  - `972aa62` / `0695bb8` member/team surfaces that already care about whether users have linked CLI/tool accounts
- That context suggests this story should reuse the existing "user needs to run db90 login" language and keep onboarding/token management consistent with the newer connection-status UX.

### Latest Technical Information

- No external library or framework research is required for this story.
- The implementation should stay within current Rails, React Router, TanStack Query, and existing DB90 account/token patterns.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Story 1.3: MCP Keycloak Device Auth](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-3-mcp-keycloak-device-auth.md)
- [Story 1.5: MCP Cursor Sync](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md)
- [Story 1.7: Release and Versioning Gate](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-7-release-versioning-gate.md)
- [Story 1.8: MCP Organization-Aware Exchange](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-8-mcp-org-aware-exchange.md)
- [Invitation accept page](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/InvitationAccept.tsx)
- [User settings page](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/UserSettings.tsx)
- [Tool accounts page](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/pages/ToolAccounts.tsx)
- [API hooks](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/hooks/useApi.ts)
- [Frontend types](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/web/src/lib/types.ts)
- [Users controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/users_controller.rb)
- [User tool accounts controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/user_tool_accounts_controller.rb)
- [MCP controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/integrations/mcp_controller.rb)
- [Ingest controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/ingest_controller.rb)
- [UserToolAccount model](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/models/user_tool_account.rb)
- [UserToolAccount serializer](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/serializers/user_tool_account_serializer.rb)
- [UserToolAccount policy](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/policies/user_tool_account_policy.rb)
- [Routes](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/config/routes.rb)
- [Swagger MCP exchange docs](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/swagger/v1/swagger.yaml:4167)
- [Architecture: attribution flow](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/architecture/architecture.md:1254)
- [Architecture: current-user tool accounts shape](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/architecture/architecture.md:2332)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- No `sprint-status.yaml` exists in `_bmad-output/implementation-artifacts/`.
- `_bmad-output/planning-artifacts/` is empty, so story context was derived from the user brief, live code, project context, architecture notes, and prior implementation stories.

### Completion Notes List

- Story created as inferred next item `1-9` after reviewing existing implementation-artifact numbering.
- Captured the missing-data seam for `lastUsedAt`: the current schema does not store `last_used_at`, so the dev agent must derive it from `ToolEvent` or add persistence deliberately.
- Preserved the user's requested API direction (`/users/me/tool_accounts`) while documenting that current-org header handling still matters because tool accounts are membership scoped.
- No sprint-status file was available to update to `ready-for-dev`.
- **Implementation (2026-05-25):** Invitation accept shows explicit CLI setup + Continue to dashboard; org is set as current immediately after accept. Settings → Tools adds ingest token table (empty state + MCP rotate via `useMcpIngestExchange`), keeps embedded `ToolAccounts`. Backend: `GET /api/v1/users/me/tool_accounts` with `MeToolAccountMetadataSerializer`, `lastUsedAt` from `ToolEvent` max per tool, `UserPolicy#tool_accounts?`. Removed stray `puts` from `McpController`. Vitest: `InvitationAccept.test.tsx`, extended `UserSettings.test.tsx`. Request specs added in `users_spec.rb` (local `bundle exec rspec` was not executed in this environment — run in `packages/api/` before merge).

### File List

- `_bmad-output/implementation-artifacts/1-9-invitation-cli-setup-and-token-management.md`
- `packages/web/src/pages/InvitationAccept.tsx`
- `packages/web/src/pages/InvitationAccept.test.tsx`
- `packages/web/src/pages/UserSettings.tsx`
- `packages/web/src/pages/UserSettings.test.tsx`
- `packages/web/src/pages/SettingsToolsSection.tsx`
- `packages/web/src/hooks/useApi.ts`
- `packages/web/src/lib/types.ts`
- `packages/api/app/controllers/api/v1/users_controller.rb`
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/app/policies/user_policy.rb`
- `packages/api/app/serializers/me_tool_account_metadata_serializer.rb`
- `packages/api/config/routes.rb`
- `packages/api/swagger/v1/swagger.yaml`
- `packages/api/spec/requests/api/v1/users_spec.rb`

## Change Log

- 2026-05-25: Implemented story 1.9 — invitation post-accept onboarding card, Settings ingest tokens + MCP rotation, `GET /users/me/tool_accounts`, Swagger, specs, and UI tests.
