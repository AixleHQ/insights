# Changelog

All notable changes to Aixle Insights are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.9] - 2026-07-27

Ninth alpha release. A large batch from `develop`: user avatars and data
exports on Active Storage, an inactive-organization access gate, and a round of
auth/impersonation and dashboard fixes. Two migrations: Active Storage tables
(additive) and a one-time cleanup that deletes orphaned project memberships
(irreversible data delete — deploy in a low-ingest window).

### Added
- User avatar upload backed by Active Storage, with a dedicated
  `UserAvatarsController`, validation, and upload-error surfacing
  (`AIX-317`).
- Exports UI and `ExportRecord` CRUD (`AIX-225`).
- Personal usage export endpoint and profile section, with CSV-injection and
  date-range guards (`AIX-226`).
- Inactive-organization gate: list filter, empty-state page, route guard, and
  header/path 403 enforcement (`AIX-590`).
- Time-range selector and period labels on the Project Members tab
  (`AIX-587`).

### Changed
- Brand scheduled report emails to match the Aixle Insights design and extract
  shared email styles (`AIX-466`).
- Clean up project memberships when a user leaves or is removed from an
  organization; one-time backfill deletes existing orphaned rows
  (`AIX-591`).

### Fixed
- Remove the doubled `/api/v1` prefix in the personal export download link
  (`AIX-505`).
- Harden impersonation token-expiry edge cases and prevent the admin profile
  from leaking during impersonation (`AIX-584`).
- Fix dashboard range toggles: selected state, radiogroup semantics, and roving
  focus so arrow keys work after the first press (`AIX-604`).
- Fix bar-chart tool colors to match Figma and give GitHub its own color
  instead of the same grey as "Other" (`AIX-586`).
- Clear the stored org on logout so `default_org_id` applies on re-login and
  silent-renew stops false-positiving (`AIX-318`).
- Stop searching the virtual `user_display` field in the admin audit-log
  controller (`AIX-570`).

## [1.0.0-alpha.8] - 2026-07-21

Eighth alpha release. Code-only batch from `develop` — no database migrations.
Secret-scanner hardening, admin `/admin` auth routing, Events user filter,
project delete/member error handling, and project overview UI polish.

### Added
- User filter sub-menu on the Events page, restricted to admin/owner
  (`AIX-564`).
- Auto-add event-contributing users to project members (`AIX-331`).

### Changed
- Route unauthenticated `/admin` through the app login instead of Keycloak, via
  a route helper (`AIX-568`).
- Drive the personal-dashboard Prompt Insights section from a runtime container
  flag and hide it on the Member Dashboard until the scorer ships (`AIX-572`).
- Project overview stat cards: readability, tokens, and Most Used Tool logo/type
  treatment; add `totalTokensIn/Out` to the project stats swagger schema
  (`AIX-131`).
- ProjectCard interaction rework — icon, star click, dropdown navigation, and
  click pass-through to the stretched link; navigate straight to settings from
  the Edit menu (`AIX-135`, `AIX-578`).
- Unify the admin org-delete block message and move it to locales
  (`AIX-561`).
- Rename CSV export filenames from the `db90` prefix to `Aixle Insights`
  (`AIX-567`).

### Fixed
- Harden the secret scanner: anchored `api_key`/`openai_key` patterns, dedup
  matches, skip structural keys, and drop `sk-` false positives (`AIX-579`).
- Return 422 instead of 500 on project delete with dependents and surface the
  real server error (`AIX-562`).
- Show an error when downgrading or removing the last project owner/member
  (`AIX-383`).
- Deep-link Recent Activity's "View all" to the active filters (`AIX-565`).

## [1.0.0-alpha.7] - 2026-07-16

Hotfix on top of `1.0.0-alpha.6`. The alpha.6 production deploy failed in the
`Run DB Migrations` step: `BackfillContinuousAggregates` called
`refresh_continuous_aggregate()` inside the implicit migration transaction, which
TimescaleDB rejects (`cannot run inside a transaction block`). Same feature scope
as alpha.6 — this release only makes that migration runnable.

### Fixed
- Add `disable_ddl_transaction!` to `BackfillContinuousAggregates` so the CAGG
  refresh runs outside a transaction block (`AIX-421`).

## [1.0.0-alpha.6] - 2026-07-16

Sixth alpha release. Large accumulated batch from `develop`: TimescaleDB
continuous-aggregate–backed stats, Events server-side sorting, admin session
hardening, project team UI, and auth/Rollbar resilience. Three migrations on the
`tool_events` hypertable (two brief write-blocking index ops + a full CAGG
backfill — deploy in a low-ingest window).

### Added
- Stats served through TimescaleDB continuous aggregates with a hybrid
  recent-window reader + historical backfill (`AIX-421`).
- 20s Redis cache on all StatsController actions with a project-scoped cache key
  (`AIX-422`).
- ProjectTeamSection on the project overview and a reworked ProjectCard
  (`AIX-135`).
- Generic GroupedBarChart extracted from ToolUsageByDayChart (`AIX-131`).
- Project/period filters on the Recent Activity widget (`AIX-523`).
- Time-range selector on the member profile page (`AIX-566`).

### Changed
- Server-side Events sorting with composite hypertable indexes and a
  ToolEventSortScope; NULL cost/tokens sort as lowest value (`AIX-334`).
- Harden admin auth: server-side admin session (avoid cookie overflow), CSP
  form-action allowance for the Keycloak origin, full logout termination, and
  external_origin pinned to APP_HOST in staging/production (`AIX-563`).
- Gate project repo controls and redirect non-owners away from settings
  (`AIX-501`).
- Reject non-Admin Anthropic API keys before saving a connector; snapshot
  audit-log before-state (`AIX-441`).

### Fixed
- Add timeouts, bounded retry, and Rollbar reporting to Keycloak admin calls
  (`AIX-529`).
- Harden auth silent-renew / callback failure handling (`AIX-528`).
- Keep the web app rendering when the Rollbar client token is empty and move
  AppRollbarProvider out of main for Fast Refresh (`AIX-581`).
- Stop JwtAuth from masking downstream errors as 401 and allow disconnecting a
  connector with synced tool events (`AIX-465`).
- Make the ingest token setup panel scrollable so a wrapped setup tab no longer
  overlaps content (`AIX-518`).
- Gracefully handle events with no prompt text (`AIX-511`).
- Truncate long org names in invitation cards (`AIX-373`).

## [1.0.0-alpha.5] - 2026-07-13

Fifth alpha release. A large accumulated batch from `develop`: multi-Slack
connectors, export delivery fixes, token-accuracy normalization, access-control
tightening, and the release runbook. Two reversible migrations (multi-Slack
index + a batched token backfill on the `tool_events` hypertable).

### Added
- Multiple Slack connectors per project with fan-out delivery and connector
  rename/label UI (`AIX-362`).
- Release & hotfix runbook at `docs/RELEASE.md` (`AIX-169`).

### Changed
- Thread the dashboard project filter through per-tab tool-insights stats and
  scope them by `project_id` (`AIX-524`).
- Hide Library/Feedback nav stubs and remove Terms/Privacy links (`AIX-510`).
- Move export jobs to a dedicated `exports` queue and drop Aixle Insights branding from
  export emails and filenames (`AIX-401`).
- Bump Keycloak to 26.6.4 for jdbc-ping clustering (`AIX-527`).
- Restrict data contribution to Owners and Members (`AIX-503`).
- Hide project management actions and guard settings for viewers (`AIX-501`).

### Fixed
- Normalize cache-inflated `tokens_in` at ingest and backfill the post-350
  window on existing events (`AIX-519`).
- Fix scheduled export delivery and download URLs via direct S3 presigned links
  (`AIX-401`).
- Process the `mailers` queue so invitation emails actually deliver
  (`AIX-468`).
- Fix 500 errors on admin delete of an organization or user by covering the
  remaining foreign-key gaps (`AIX-372`).
- Align the audit-log admin dashboard with the real schema (`AIX-520`).
- Validate duplicate project names and extract create/update into form objects
  (`AIX-507`).
- Redirect detail pages on organization switch and reset the dashboard project
  filter on org switch (`AIX-346`, `AIX-530`).
- Paginate the project issues list (`AIX-494`).
- Keep the Cost Trend chart as a rolling window for the current month
  (`AIX-496`).
- Derive the ActionCable URL from the page origin (`AIX-497`).
- Use the local calendar date for Events date presets and apply the `user_id`
  filter on the Events page (`AIX-498`, `AIX-506`).
- Show the real event time and git author in the Event Drawer (`AIX-499`).
- Prevent connector icons from squishing in flex rows (`AIX-500`).
- Key the Events `risk_level` filter off the latest audit log rather than any
  historical match (`AIX-464`).
- Remove ActiveSupport `presence`/`present?` calls from the Temporal worker
  (`AIX-333`).

## [1.0.0-alpha.4] - 2026-07-07

Fourth alpha release. A focused production-readiness pass (`AIX-333`): make
the required-env contract explicit and fail fast, harden S3/SES/admin auth, and
add an environment audit task. No database migrations.

### Added
- `production_readiness` rake tasks: `check_env` (audits ~30 required prod/staging
  env vars and aborts on any missing), `send_test_email`, and `oauth_checklist`
  (`AIX-333`).

### Changed
- Storage uploads use the ECS task IAM role for S3 instead of relying on implicit
  credentials (`AIX-333`).
- Raw event store and the Temporal `fetch_raw_event` activity hardened around
  S3/SES access and error handling (`AIX-333`).

### Fixed
- Fail fast on a missing `SMTP_ADDRESS` in production/staging: drop the implicit
  `smtp.sendgrid.net` default so a misconfigured mailer surfaces at boot instead
  of silently mis-sending (`AIX-333`).
- Tighten admin authentication on the affected endpoints (`AIX-333`).

## [1.0.0-alpha.3] - 2026-07-06

Third alpha release. Ships product features and fixes cut from `develop` since
`1.0.0-alpha.2`, focused on production hardening (TLS/host allow-list), the
Aixle Insights rebrand, and timezone/Jira-sync/invitation fixes.

### Added
- "No Project" option in the dashboard project filter (`AIX-445`).
- Model column in the org Events list table and tokens in/out split in the Event
  Drawer (`AIX-393`, `AIX-394`).
- Admin invitation management: create, edit, and delete (`AIX-289`).
- Auto-enqueue provider sync after the first OAuth connect (`AIX-451`).

### Changed
- Rebrand admin panel and remaining API references from Aixle Insights to Aixle Insights
  (`AIX-495`).
- Relabel tool charts to remove the AI-only implication (`AIX-444`).
- Rename `client_time_zone` to `client_zone` (`AIX-447`).

### Fixed
- Enforce `force_ssl` and `config.hosts` in production and staging; move the host
  allow-list into a top-level module and allow the internal Cloud Map host
  (`AIX-367`).
- Anchor dashboard, project events, and export date ranges to the user timezone
  (`AIX-447`).
- Jira/Linear sync UX: reset `issues_synced_at` on re-link, delete stale issues,
  refetch on sync completion, and correct the syncing state (`AIX-450`).
- Invitation flow: apply invited role on existing membership, preserve redirect
  through OAuth login, idempotent accept, email delivery and SMTP settings
  (`AIX-289`).
- Normalize and harden `project_id=none` scoping in stats (`AIX-445`).
- Break the health/connectors invalidation loop and probe health on load
  (`AIX-419`).
- Respect the selected date range for Tool Insights active users (`AIX-502`).
- Remove the implicit 30-day cutoff from aggregated report exports (`AIX-449`).
- Use the ECS IAM role for S3 storage instead of explicit AWS keys (`AIX-289`).

## [1.0.0-alpha.2] - 2026-07-01

Second alpha release. Ships product features cut from `develop` since
`1.0.0-alpha.1`, plus security hardening and CI/deploy alignment for the new
staging AWS account.

### Added
- Aggregated report exports API (`AIX-223`).
- Scheduled report exports: CRUD, background job, and mailer delivery (`AIX-224`).
- Terms of Service and Privacy Policy pages with links on the login screen (`AIX-320`).
- Centralized frontend route paths via `AppRoutes` constants (`AIX-320`).

### Fixed
- Risk Alerts events filter: `not_none` returning zero results, drill-down hiding
  filtered events, and risk-level filtering via `audit_logs` for all levels
  (`AIX-414`).
- Scheduled exports: schedule drift, `deliver_later` handling, monthly clamp bug,
  and duplicate delivery (`SKIP LOCKED`) (`AIX-224`).
- Legal pages: return navigation and undefined project id in settings route calls
  (`AIX-320`).
- Timeseries schema bootstrap: `CREATE SCHEMA IF NOT EXISTS` in `structure.sql`
  (`AIX-368`).

### Security
- Admin JWT verification: close account-takeover path (missing signature check),
  add `iss`/`aud` validation in `Keycloak::JwtVerifier` (`AIX-366`).
- Authorization on nested project resources: scope `set_project` + `authorize!`,
  harden A01-3 existence leaks in project/org controllers (`AIX-368`).

### Changed
- Legal pages brand copy: Aixle Insights → Aixle Insights (`AIX-320`).
- CI/CD and remote deploy Makefile: unified `aixle-db90` project name and deploy
  role for staging and production (new staging AWS account).

## [1.0.0-alpha.1] - 2026-06-29

First tagged release. Scope is intentionally narrow: this alpha validates the
production infrastructure (image build, DB migrations, secrets/ENV wiring,
service boot, deploy pipeline, Rollbar) ahead of the full 1.0.0. Feature content
continues to land on `develop` and ships in subsequent `1.0.0-alpha.*` / `-rc.*`
tags cut from the same `release/1.0.0` branch.

### Added
- Initial Aixle Insights platform release cut from `develop` for production infrastructure validation.

[1.0.0-alpha.9]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.9
[1.0.0-alpha.8]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.8
[1.0.0-alpha.7]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.7
[1.0.0-alpha.6]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.6
[1.0.0-alpha.5]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.1
