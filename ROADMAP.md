# Roadmap

This roadmap reflects where Aixle Insights has been and where it's headed. Items are directional — timing and scope may shift.

## Recently shipped

### v1.1.0 (2026-08-18)

- Multi-org CLI init with org picker and `organization_id` surfaced in health/status
- Claude `tool_use` classify/summarize helpers and per-turn derivative payload sync
- Cursor model resolution via `state.vscdb` fallback for accurate per-turn attribution
- OS keychain preferred over credentials file with cross-platform hardening
- HTTPS enforced end-to-end in the CLI; HTTP opt-in for non-production testing only
- API auth hardening: scoped CORS, deactivated-org blocking, CSRF on admin OAuth callback
- Supply-chain security: `eslint-plugin-security` lint gate added to the CLI package

### v1.0.0 (2026-08-05)

- Full ingestion pipeline: CLI push (`@aixle/insights`) + connector pull + ingest endpoint
- Prompt capture pipeline — opt-in, off by default (`AIXLE_INSIGHTS_PROMPT_CAPTURE`)
- Risk scoring and PII/secret sanitization on every event
- Cost attribution to people and projects across 10+ AI APIs
- `@aixle/insights` npm CLI + MCP server with stable/staging dual-channel distribution
- Keycloak OIDC auth with optional Google social login
- Data retention policies backed by TimescaleDB hypertable and automated policies

## What's next

We're actively developing Aixle Insights. Planned work includes deeper connector coverage, improved cost attribution, and self-hosted deployment guides. Watch [GitHub Issues](https://github.com/AixleHQ/insights/issues) and [Releases](https://github.com/AixleHQ/insights/releases) for specifics as they land.
