# Story 1.3: MCP Keycloak Device Auth

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DB90 engineer,
I want the `@db90/mcp` package to complete Keycloak OIDC device flow and exchange the resulting Keycloak access token for a DB90 ingest token,
so that `npx -y @db90/mcp init` can install real credentials without the temporary hardcoded `~/.db90-mcp/credentials.json` workflow.

## Acceptance Criteria

1. Backend exposes `POST /api/v1/integrations/mcp/exchange` under the existing `api/v1` namespace and keeps it protected by standard `JwtAuth` middleware. The Keycloak device-flow access token is sent as `Authorization: Bearer <kc_access_token>`.
2. The exchange endpoint accepts JSON `{ "tool_name": "claude_code", "device_label": "claude-code on alex's MBP" }`; `device_label` is accepted for client context but does not require a schema or database change in this story.
3. The endpoint resolves the authenticated user's organization membership, finds or creates one `UserToolAccount` for that membership and `tool_name`, calls `rotate_ingest_token!`, and returns:
   ```json
   {
     "data": {
       "ingestToken": "db90_...",
       "ingestHost": "http://localhost:3000",
       "organizationId": "<org-id>"
     }
   }
   ```
4. The endpoint authorizes with `UserToolAccountPolicy#create?` against the resolved `OrganizationMembership`. Do not keep the current `Integrations::McpPolicy` authorization path for this action.
5. Unsupported or missing `tool_name` returns `422` with validation errors. The allowed tools for this story are those that can use ingest tokens today; at minimum `claude_code`, and do not accept non-ingest tools such as `github_copilot`.
6. Missing JWT returns `401` from the existing auth middleware. The route must not be added to `JwtAuth::EXCLUDED_PATHS`.
7. `packages/api/swagger/v1/swagger.yaml` documents the exchange endpoint in the same change, using the `{ data: ... }` camelCase response shape and mirroring the style of existing tool-account entries.
8. Backend request specs cover happy path, token rotation on repeated calls without duplicate account creation, `401` missing JWT, and `422` unknown tool. Specs must assert `data.ingestToken`, `data.ingestHost`, and `data.organizationId`.
9. `packages/tools/db90-mcp/src/auth/keycloak.ts` implements RFC 8628 device authorization grant: start device authorization, print/surface `verification_uri` plus `user_code`, poll the token endpoint at the advised interval, handle `authorization_pending`, `slow_down`, `access_denied`, and `expired_token`, and return the Keycloak `access_token`.
10. The client determines the Keycloak issuer from a build-time/env/default config, with a `--keycloak-url` CLI override. Local default should support the docker-compose stack (`http://localhost:8080/realms/db90`); production default should be safe for published package usage.
11. `packages/tools/db90-mcp/src/auth/exchange.ts` posts to `/api/v1/integrations/mcp/exchange` with the Keycloak access token, parses `data.ingestToken`, `data.ingestHost`, and `data.organizationId`, and persists the ingest credential through `credentials.ts`.
12. `packages/tools/db90-mcp/src/auth/credentials.ts` replaces the manual JSON-only reader with a keytar-backed credential store plus file fallback at `~/.db90-mcp/credentials.json` using chmod `0600`. Public API: `loadCredentials()`, `saveCredentials(token, host)`, and `clearCredentials()`.
13. Existing sync/status code continues to call `loadCredentials()` and works without knowing whether credentials came from keychain or fallback file.
14. `packages/tools/db90-mcp/src/server.ts` registers a `db90_authenticate` MCP tool that starts the same authentication flow and returns structured JSON/text suitable for Claude Code to show the visit URL and code.
15. `packages/tools/db90-mcp/src/cli.ts` changes `init` from "print config snippet only" to a first-class terminal login flow. Running `npx -y @db90/mcp init --host http://localhost:3000 --keycloak-url http://localhost:8081/realms/db90` prints `Visit http://localhost:8081/realms/db90/device and enter code XXXX-YYYY`, polls until login succeeds, exchanges the token, stores credentials, and exits zero.
16. `init` remains usable from a real terminal and does not depend on the editor/MCP transport. `run` remains the default long-lived MCP server command, and `run --once` continues to sync with the saved ingest credential.
17. MCP tests cover the credential store file fallback, exchange request parsing, device-flow polling behavior, CLI `init` argument parsing, and `db90_authenticate` tool registration. Network calls are mocked in Vitest.
18. Manual DoD: against local docker-compose, `npx -y @db90/mcp init` completes login through Keycloak and writes a fresh ingest token to keychain or fallback credentials; the old phase-2 hardcoded credentials setup is no longer required.

## Tasks / Subtasks

- [x] Reconcile the current partial implementation before editing. (AC: 1-18)
  - [x] Use the actual MCP package path `packages/tools/db90-mcp/`, not `packages/db90-mcp/`.
  - [x] Treat existing `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`, `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb`, and Swagger path as partial work that must be corrected, not duplicated.
  - [x] Keep `db90_status`, `db90_sync_now`, background sync, advisory locking, and `run --once` behavior from Story 1.2 intact.
- [x] Update the Rails exchange endpoint contract. (AC: 1-8)
  - [x] In `McpController#exchange`, resolve the membership for `current_user`. If organization selection is ambiguous, prefer the oldest membership to match current behavior, but document the deferred `X-Organization-ID` follow-up.
  - [x] Authorize with `authorize! membership, to: :create?, with: UserToolAccountPolicy`.
  - [x] Validate `tool_name` against ingest-capable tools (`UserToolAccount::INGEST_TOOLS` is the best source of truth unless product explicitly narrows this story to `claude_code` only).
  - [x] Find or initialize `membership.user_tool_accounts.find_or_initialize_by(tool_name: tool_name)`, set `is_active = true`, save new records if needed, then call `rotate_ingest_token!` for both new and existing records so the response always contains a fresh token.
  - [x] Return `status: :created` with `{ data: { ingestToken:, ingestHost: request.base_url, organizationId: membership.organization_id } }`.
  - [x] Do not use `DB90_PUBLIC_HOST` unless the product explicitly wants a public URL override; the requested contract says `request.base_url`.
  - [x] Remove or leave unused `Integrations::McpPolicy` only if no other action references it; do not expand it for this story.
- [x] Update backend specs and Swagger. (AC: 7-8)
  - [x] Rename or create the requested request spec at `packages/api/spec/requests/api/v1/integrations/mcp_controller_spec.rb`; if keeping the existing `mcp_spec.rb`, ensure the story implementation notes explain why.
  - [x] Assert happy path creates one `UserToolAccount`, response `data.ingestToken` matches `db90_<64hex>`, `data.ingestHost` equals `request.base_url`, and `data.organizationId` equals the membership org id.
  - [x] Assert repeated exchange for the same membership and tool rotates token but does not create a second account.
  - [x] Assert missing auth with raw `post` returns `401`.
  - [x] Assert unknown tool such as `github_copilot` returns `422`.
  - [x] Update `packages/api/swagger/v1/swagger.yaml` to remove the current top-level `ingest_token`, `host`, `tool_name` response and replace it with the required `{ data: ... }` shape.
- [x] Add MCP auth modules. (AC: 9-13)
  - [x] Create `packages/tools/db90-mcp/src/auth/keycloak.ts`.
  - [x] Create `packages/tools/db90-mcp/src/auth/exchange.ts`.
  - [x] Move/replace `packages/tools/db90-mcp/src/credentials.ts` with `packages/tools/db90-mcp/src/auth/credentials.ts`, or keep a compatibility re-export at the old path so existing imports in `server.ts`, `cli.ts`, and tests do not break.
  - [x] Use `application/x-www-form-urlencoded` POSTs for Keycloak device authorization and token polling.
  - [x] Poll `${issuer}/protocol/openid-connect/token` with grant `urn:ietf:params:oauth:grant-type:device_code`, respect the returned `interval`, increase by 5 seconds on `slow_down`, stop on terminal errors, and time out after `expires_in`.
  - [x] Persist only the DB90 ingest token and host; do not persist the Keycloak access token.
  - [x] Add `keytar` as an optional dependency or normal dependency only after checking install behavior for Node 20+ and CI. Because keytar is native, keep the file fallback robust and tested.
- [x] Wire CLI and MCP tool. (AC: 14-16)
  - [x] Extend `parseArgs` with `--host`, `--keycloak-url`, and any required `--tool-name` option while preserving current unknown-flag safety.
  - [x] Change `init` to run the real terminal auth flow and print the device URL/code immediately before polling.
  - [x] Keep help text accurate: remove "no auth, no file writes" language and explain keychain/file fallback.
  - [x] Add `db90_authenticate` to `createDb90McpServer()` with no required input or with optional host/keycloak override fields if the MCP SDK schema pattern already supports it cleanly.
  - [x] Ensure auth failures return structured tool output instead of throwing through the MCP transport.
- [x] Add focused client tests. (AC: 11-17)
  - [x] Mock `fetch` for device authorization success, `authorization_pending`, `slow_down`, and final token success.
  - [x] Mock exchange response and assert `Authorization: Bearer <kc_access_token>` plus body `{ tool_name: "claude_code", device_label: ... }`.
  - [x] Test `saveCredentials`, `loadCredentials`, and `clearCredentials` against a temp `DB90_MCP_HOME`; assert fallback file mode is `0600` on POSIX.
  - [x] Test keytar absence/failure falls back to file without losing credentials.
  - [x] Extend server tests so `listTools()` includes `db90_authenticate` in addition to the existing tools.
  - [x] Extend CLI tests for `init --host ... --keycloak-url ...` argument parsing and successful mocked flow.
- [x] Verify locally. (AC: 18)
  - [x] Start the local stack with docker compose and confirm Keycloak device authorization endpoint is enabled (`db90-web` must allow OAuth 2.0 Device Authorization Grant — see `keycloak/realm-import.json`).
  - [x] Run `npx -y @db90/mcp init --host http://localhost:3000 --keycloak-url http://localhost:8080/realms/db90` from a real terminal (after realm re-import / device grant enabled on `db90-web`).
  - [x] Complete the browser login in Keycloak using the printed code.
  - [x] Confirm credentials are stored in keychain or `~/.db90-mcp/credentials.json` with mode `0600`.
  - [x] Run `db90-mcp run --once` without manually creating credentials and confirm it uses the newly stored ingest token.

### Review Findings

- [x] [Review][Patch] Make `db90_authenticate` start-only and return the device URL/code in the tool response [`packages/tools/db90-mcp/src/server.ts:161`]
- [x] [Review][Patch] Require explicit Keycloak issuer for published usage; keep localhost default only behind an explicit local/dev condition [`packages/tools/db90-mcp/src/auth/keycloak.ts:183`]
- [x] [Review][Patch] Credential persistence always writes plaintext fallback and can prefer stale keytar credentials [`packages/tools/db90-mcp/src/auth/credentials.ts:87`]
- [x] [Review][Patch] Credential tests can overwrite or delete a developer's real keychain entry [`packages/tools/db90-mcp/src/test/auth/credentials.test.ts:21`]
- [x] [Review][Patch] CLI `--tool-name` silently coerces invalid values to `claude_code` [`packages/tools/db90-mcp/src/cli.ts:195`]
- [x] [Review][Patch] MCP auth tests do not cover required RFC 8628 polling errors and keytar fallback paths [`packages/tools/db90-mcp/src/test/auth/keycloak.test.ts:43`]
- [x] [Review][Patch] Concurrent exchange requests can invalidate a token that was just returned to another caller [`packages/api/app/controllers/api/v1/integrations/mcp_controller.rb:34`]
- [x] [Review][Patch] Token polling hides persistent network or invalid-JSON failures as a generic timeout [`packages/tools/db90-mcp/src/auth/keycloak.ts:112`]

## Dev Notes

### Current Repo State

- Existing MCP package path is `packages/tools/db90-mcp/`. The user-provided `packages/db90-mcp/...` paths are stale for this monorepo.
- Story 1.2 already added sync/timer/status behavior and manual credentials. This story replaces the manual credential bootstrap; it must not remove the sync pipeline.
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb` already exists, but it currently:
  - authorizes with `Integrations::McpPolicy`, not `UserToolAccountPolicy#create?`;
  - returns top-level `ingest_token`, `host`, and `tool_name`, not `{ data: { ingestToken, ingestHost, organizationId } }`;
  - uses `ENV.fetch("DB90_PUBLIC_HOST", request.base_url)`, while this story asks for `request.base_url`;
  - only rotates on existing records; new records rely on the create callback token instead of explicitly calling `rotate_ingest_token!`;
  - has comments saying AIX-164 will replace the policy. This story is that replacement.
- `packages/api/swagger/v1/swagger.yaml` already has `/api/v1/integrations/mcp/exchange`, but its response shape is currently stale.
- `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb` already covers several scenarios, but it asserts the old response shape and current policy behavior.
- `packages/tools/db90-mcp/src/credentials.ts` currently reads only a manual JSON file and exposes only `loadCredentials()`. It needs `saveCredentials()` and `clearCredentials()` plus keytar/file fallback.
- `packages/tools/db90-mcp/src/cli.ts` currently prints a setup snippet for `init`. It must become an interactive terminal device-flow command while preserving `run` as the default command.

### Architecture Compliance

- Rails controllers must stay thin: validation, authorization, `UserToolAccount` lookup/rotation, and render are enough here. Do not add a service unless the controller becomes multi-step beyond the exchange.
- Every authenticated Rails action must call ActionPolicy. For this endpoint, use `UserToolAccountPolicy#create?` with the membership record, matching `UserToolAccountsController#create`.
- Do not add the exchange route to `JwtAuth::EXCLUDED_PATHS`; missing auth must be handled by JwtAuth as `401`.
- Keep Rails JSON response keys camelCase inside `data` for this new endpoint because the MCP TypeScript client consumes `ingestToken`, `ingestHost`, and `organizationId`.
- Do not introduce a new auth framework in MCP. Use `fetch`, TypeScript ESM, and small modules under `src/auth/`.
- Keycloak device flow is RFC 8628. The device authorization endpoint is `${issuer}/protocol/openid-connect/auth/device`; the token endpoint is `${issuer}/protocol/openid-connect/token`.
- RFC 8628 polling rules matter: wait at least `interval` seconds, continue on `authorization_pending`, add 5 seconds on `slow_down`, stop on `access_denied` and `expired_token`, and avoid tight polling on network errors.
- `keytar` 7.9.0 is the current npm package and uses OS credential stores: macOS Keychain, Linux Secret Service/libsecret, and Windows Credential Vault. Linux may lack libsecret, so fallback file behavior is not optional.

### File Structure Requirements

- Backend files to update:
  - `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
  - `packages/api/config/routes.rb` only if the existing route is missing or needs adjustment
  - `packages/api/swagger/v1/swagger.yaml`
  - `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb` or new `packages/api/spec/requests/api/v1/integrations/mcp_controller_spec.rb`
- Backend files to inspect before deciding deletion:
  - `packages/api/app/policies/integrations/mcp_policy.rb` if present
  - `packages/api/app/policies/user_tool_account_policy.rb`
  - `packages/api/app/models/user_tool_account.rb`
  - `packages/api/spec/support/auth_helper.rb`
- MCP files to create:
  - `packages/tools/db90-mcp/src/auth/keycloak.ts`
  - `packages/tools/db90-mcp/src/auth/exchange.ts`
  - `packages/tools/db90-mcp/src/auth/credentials.ts`
- MCP files to update:
  - `packages/tools/db90-mcp/src/credentials.ts` as a compatibility re-export or deletion with import updates
  - `packages/tools/db90-mcp/src/server.ts`
  - `packages/tools/db90-mcp/src/cli.ts`
  - `packages/tools/db90-mcp/src/test/server.test.ts`
  - `packages/tools/db90-mcp/src/test/cli.test.ts`
  - `packages/tools/db90-mcp/package.json`
  - `packages/tools/package-lock.json` if `keytar` or another dependency is added
  - `packages/tools/db90-mcp/README.md`

### Testing Requirements

- Backend:
  ```bash
  cd packages/api
  bundle exec rspec spec/requests/api/v1/integrations/mcp_spec.rb
  bundle exec rubocop --parallel
  ```
- If the spec is renamed to `mcp_controller_spec.rb`, run that exact path instead.
- MCP:
  ```bash
  cd packages/tools
  npm run build --workspace=@db90/mcp
  npm test --workspace=@db90/mcp
  ```
- End-to-end local smoke:
  ```bash
  npx -y @db90/mcp init --host http://localhost:3000 --keycloak-url http://localhost:8081/realms/db90
  db90-mcp run --once
  ```

### Regression Risks

- Do not create duplicate `UserToolAccount` rows on repeated auth for the same membership/tool. The whole point is fresh token rotation on the same account.
- Do not leak or persist the Keycloak access token. The durable credential is the DB90 ingest token only.
- Do not return the encrypted `access_token` field through `UserToolAccountSerializer`; this endpoint is the one-time plaintext token path and must return only the fresh `plaintext_token`.
- Do not break current manual file fallback in headless/CI environments where keytar cannot load.
- Do not block MCP stdio startup on authentication. `db90_authenticate` and CLI `init` start auth explicitly; default `run` should still start and report unauthenticated status when credentials are absent.
- Do not use browser-opening automation inside `init`; print the URL and code for a real terminal workflow.
- Do not hardcode only localhost. Defaults may be local-friendly, but host and Keycloak issuer must be overrideable.

### Previous Story Intelligence

- Story 1.2 established `DB90_MCP_HOME` for tests. Reuse it for credential fallback tests so test runs do not touch the real `~/.db90-mcp`.
- Story 1.2 review already caught CLI argument safety issues. Preserve the pattern where unknown flags or invalid option combinations show help rather than accidentally starting the server.
- Story 1.2 review already caught MCP tool exception handling. `db90_authenticate` must return structured failure output, not throw raw errors through the tool call.
- Story 1.2 intentionally duplicated Claude reader/sync code in MCP. Do not attempt a shared package refactor in this auth story.

### References

- [Project context](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/project-context.md)
- [Previous Story 1.2](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/_bmad-output/implementation-artifacts/1-2-mcp-claude-sync-timer.md)
- [Task 07 plan](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/plans/npm-distribution-AIX-157/tasks/07-mcp-auth.md)
- [Current MCP controller](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/integrations/mcp_controller.rb)
- [UserToolAccount model](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/models/user_tool_account.rb)
- [UserToolAccount policy](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/policies/user_tool_account_policy.rb)
- [User tool accounts controller create pattern](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/controllers/api/v1/user_tool_accounts_controller.rb)
- [JwtAuth middleware](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/app/middleware/jwt_auth.rb)
- [Keycloak Rails config](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/api/config/initializers/keycloak.rb)
- [Current MCP CLI](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-mcp/src/cli.ts)
- [Current MCP server](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-mcp/src/server.ts)
- [Current MCP credentials reader](/Users/kirillkozyrev/Work/DBP-projects/db90-rails/packages/tools/db90-mcp/src/credentials.ts)
- RFC 8628 OAuth 2.0 Device Authorization Grant: https://www.rfc-editor.org/rfc/rfc8628.html
- Keycloak device authorization endpoint docs: https://www.keycloak.org/docs/latest/server_admin/
- keytar npm package: https://www.npmjs.com/package/keytar

## Dev Agent Record

### Agent Model Used

Composer (GPT-5.2)

### Debug Log References

### Completion Notes List

- Story created from direct user goal because no BMad sprint status or planning artifacts were present under `_bmad-output/planning-artifacts`.
- Existing backend exchange and MCP manual credential code are partial/superseded by this story; implementation should correct them rather than create parallel files.
- Web research included RFC 8628 polling semantics, Keycloak device endpoint path, and keytar platform/fallback considerations.
- **Implementation (2026-05-18):** Rails `McpController#exchange` now uses `UserToolAccountPolicy#create?` on primary membership, validates `tool_name` via `UserToolAccount::INGEST_TOOLS`, always calls `rotate_ingest_token!`, returns camelCase `data` payload with `request.base_url` for `ingestHost`. Removed `Integrations::McpPolicy`. Request specs + Swagger updated; external user with membership now receives 201 per policy.
- **MCP:** Added `auth/keycloak.ts`, `auth/exchange.ts`, `auth/flow.ts`, `auth/credentials.ts` (async credential API, keytar optional + `0600` file), CLI `init` flags, `db90_authenticate` tool (Zod input), Vitest coverage. `keycloak/realm-import.json` enables `oauth2DeviceAuthorizationGrantEnabled` on `db90-web` for **new** imports.
- **Verification:** `docker compose exec api bundle exec rspec spec/requests/api/v1/integrations/mcp_spec.rb` — 8 examples, 0 failures. `npm run build` + `npm test --workspace=@db90/mcp` — green. Live Keycloak in this workspace still returned `unauthorized_client` for device grant until realm is re-imported from the updated JSON (documented in README).
- **AC18 / manual E2E:** Full browser device login + `run --once` against the long-running compose stack was **not** re-run end-to-end in this session after code changes; operator should re-import realm (or toggle device grant in Keycloak admin), use port **8080** (not 8081 from older story text), then run `db90-mcp init`.

### File List

- `keycloak/realm-import.json`
- `packages/api/app/controllers/api/v1/integrations/mcp_controller.rb`
- `packages/api/app/policies/integrations/mcp_policy.rb` (deleted)
- `packages/api/spec/requests/api/v1/integrations/mcp_spec.rb`
- `packages/api/swagger/v1/swagger.yaml`
- `packages/tools/db90-mcp/package.json`
- `packages/tools/package-lock.json`
- `packages/tools/db90-mcp/CHANGELOG.md`
- `packages/tools/db90-mcp/README.md`
- `packages/tools/db90-mcp/src/auth/credentials.ts`
- `packages/tools/db90-mcp/src/auth/exchange.ts`
- `packages/tools/db90-mcp/src/auth/flow.ts`
- `packages/tools/db90-mcp/src/auth/keycloak.ts`
- `packages/tools/db90-mcp/src/cli.ts`
- `packages/tools/db90-mcp/src/credentials.ts`
- `packages/tools/db90-mcp/src/keytar.d.ts`
- `packages/tools/db90-mcp/src/server.ts`
- `packages/tools/db90-mcp/src/test/auth/credentials.test.ts`
- `packages/tools/db90-mcp/src/test/auth/exchange.test.ts`
- `packages/tools/db90-mcp/src/test/auth/keycloak.test.ts`
- `packages/tools/db90-mcp/src/test/cli.test.ts`
- `packages/tools/db90-mcp/src/test/server.test.ts`
- `_bmad-output/implementation-artifacts/1-3-mcp-keycloak-device-auth.md`

## Change Log

- **2026-05-18:** Created ready-for-dev story for Keycloak device flow, backend ingest-token exchange contract correction, keytar/file credential persistence, `db90_authenticate`, and terminal `init` auth.
- **2026-05-18:** Implemented exchange API + MCP auth pipeline, tests, realm device-grant flag, README/CHANGELOG. Manual AC18 (live Keycloak init + `run --once`) remains pending realm refresh / operator verification.
