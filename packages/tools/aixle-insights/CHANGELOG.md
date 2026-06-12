# Changelog

All notable changes to `@aixle/insights` will be documented in this file.

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
