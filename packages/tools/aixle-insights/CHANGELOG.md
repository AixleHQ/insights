# Changelog

All notable changes to `@aixle/insights` will be documented in this file.

## 0.2.0 — 2026-07-28

Published to the `latest` dist-tag. See the README's **Choosing a version** section for the
production/staging channel split.

### Changed

- **Minimum Node is now 20.19.0** (was `>=20`). Raised alongside the dependency refresh below; older 20.x patch releases are no longer supported. (AIX-361)

### Fixed

- **Cursor composer cost no longer fabricates tokens.** The line-count cost model charged for every suggested line; cost is now charged on *accepted* lines (`tabAccepted`), so per-event cost and token counts stop inflating on heavy-suggestion sessions. (AIX-352)
- **Anthropic cache tokens are priced correctly, and `tokens_in` is no longer inflated.** Cache-creation and cache-read tokens were previously folded into the input count at full input rate. (AIX-350)
- **Dated model pricing resolves correctly.** Model identifiers carrying a date suffix fell through to generic rates instead of matching their pricing entry. (AIX-349)
- **Same-day Cursor daily stats are re-read on each sync.** A day's aggregate was previously captured once and never refreshed, so activity later the same day was dropped until the next calendar day. (AIX-354)

### Changed

- **MCP tool names rebranded**: `db90_status`, `db90_sync_now`, `db90_authenticate` are renamed to `aixle_insights_status`, `aixle_insights_sync_now`, `aixle_insights_authenticate` to match the `@aixle/insights` / Aixle Insights branding. The old `db90_*` names remain registered as deprecated aliases (same behavior, description notes the replacement) for one release and will be removed in a follow-up. (AIX-569)

### Security

- `aixle-insights init` now refuses to proceed against a non-loopback host that uses plaintext `http://`. Both the user-supplied `--host` flag and the `ingestHost` returned by the server's token-exchange response are checked. Loopback (`localhost`, `127.0.0.0/8`, `[::1]`) is unaffected. Pass `--insecure` only for trusted non-production test endpoints; the override is **init-only** and not honored by `run`. (AIX-339)
- **Cursor SQLite readers are hardened against path escapes.** Stores are opened through a single read-only helper that resolves and validates the real path, keeping reads inside the expected root; audit paths are validated before `stat`. (AIX-338)
- **Dependency CVEs resolved** ahead of the open-source release — full lockfile refresh for the package tree. (AIX-361)
- README has a new **Security** section (developer guide for the TLS gate model) and a **Troubleshooting** section covering common local-tracking failure modes (401 ingest, fetch-failed, npm-link vs published-version confusion, missing Temporal worker).

### Internal

- New module `src/lib/transport-security.ts` exports a pure `evaluateTransportSecurity()` for reuse by future entry points.
- New read-only SQLite open helper, reused by Cursor version discovery and the store probe. (AIX-338)
- Test suite grows from 394 to **465 tests across 37 files** — transport-security units and gate cases, Cursor dedupe plus truncated-database fixtures, and pricing coverage for cache tokens and dated models.
- ARD gains maintenance guidance, and the docs record Node ABI / `npm rebuild` expectations for the native `better-sqlite3` binding. (AIX-338)

## 0.1.1 — 2026-06-12

### Internal

- Publish pipeline migrated to OIDC Trusted Publishing — no stored npm token.
- CI: Node 20 → 24; SHA-pinned GitHub Actions (`actions/checkout@v6.0.3`, `actions/setup-node@v6.4.0`); `npm ci --ignore-scripts`; `npm audit signatures`; lifecycle-script guard; surgical `npm rebuild better-sqlite3` after install to compile the native binding without re-enabling all postinstall scripts.
- `publishConfig.provenance: false` — provenance attestation is deferred until the source repo is public. npm rejects provenance bundles from private GitHub repos (HTTP 422). All other supply-chain defenses (OIDC, hardware 2FA, `npm audit signatures`, `--ignore-scripts` with a surgical allowlist) remain active.

No functional changes to the package itself.

## 0.1.0

Initial release of `@aixle/insights` — stdio MCP server for AI coding-assistant telemetry (Claude transcripts + Cursor SQLite ingest).

### Features

- **Claude Code ingest**: parses `~/.claude/projects/**/*.jsonl` transcript turns, sends one POST per turn with `tool_name=claude_code`, model, tokens, prompt + assistant text, project attribution, and risk-scan metadata.
- **Cursor ingest**: reads Cursor's SQLite store + optional hook-forwarder queue; sends one POST per chat turn / hook event with workspace + model attribution.
- **OIDC device login**: `aixle-insights init` runs Keycloak device authorization, exchanges OIDC for per-tool ingest tokens, stores them in the OS keychain (keytar) or a `~/.aixle-insights/credentials.json` fallback (mode 0600).
- **MCP tools**: `db90_status`, `db90_sync_now`, `db90_authenticate` exposed over the stdio MCP transport.
- **Background sync**: 5-minute cycle; advisory `state.lock` prevents concurrent runs; per-credential checkpoints prevent re-syncing the same turn.
- **Cursor hook forwarder (opt-in)**: `aixle-insights init --hooks` writes a Node forwarder into `~/.cursor/hooks.json` for per-turn model attribution.
- **Health diagnostics**: `aixle-insights health` (CLI) and `db90_status` (MCP) return credentials, last sync, log path, and state file structure.
- **Rate-limit + retry**: postEvent retries 3× with exponential backoff (1s/4s/16s); 429 honors `Retry-After`; rate-limit windows persist across process restarts.

### Requirements

- Node.js ≥ 20.
- macOS / Linux / Windows.

### Compatibility notes

- Local state directory is `~/.aixle-insights/` (override: `AIXLE_INSIGHTS_HOME`).
- Keytar service identifier: `aixle-insights`.
- MCP server entry written to `~/.claude.json` is under `mcpServers.aixle-insights`.
