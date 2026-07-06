# Changelog

All notable changes to DB90 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Rebrand admin panel and remaining API references from DB90 to Aixle Insights
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
- Legal pages brand copy: DB90 → Aixle Insights (`AIX-320`).
- CI/CD and remote deploy Makefile: unified `aixle-db90` project name and deploy
  role for staging and production (new staging AWS account).

## [1.0.0-alpha.1] - 2026-06-29

First tagged release. Scope is intentionally narrow: this alpha validates the
production infrastructure (image build, DB migrations, secrets/ENV wiring,
service boot, deploy pipeline, Rollbar) ahead of the full 1.0.0. Feature content
continues to land on `develop` and ships in subsequent `1.0.0-alpha.*` / `-rc.*`
tags cut from the same `release/1.0.0` branch.

### Added
- Initial DB90 platform release cut from `develop` for production infrastructure validation.

[1.0.0-alpha.3]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.1
