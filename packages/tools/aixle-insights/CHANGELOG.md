# Changelog

All notable changes to `@aixle/insights` will be documented in this file.

## 0.2.1 — 2026-08-11

Published to the `latest` dist-tag.

### Changed

- **BREAKING (for multi-org operators): `init` no longer silently binds the oldest membership.** When `--organization-id` / `DB90_ORGANIZATION_ID` is omitted, `init` now resolves the target org deterministically: a single-org account binds automatically (unchanged), and a multi-org account binds the user's **Default Organization** (`default_org_id`) preference from the web app. A multi-org account with no valid preference is no longer bound to an arbitrary (oldest) membership — `init` prints the caller's organizations and exits non-zero **without saving credentials**. Remediate by re-running with `--organization-id <uuid>` or by setting a Default Organization in web Preferences; either way the Keycloak device login must be completed again, since credentials persist only on success. `aixle-insights health` and the `aixle_insights_status` MCP tool now surface the bound `organization_id`. Note the web "current org" is the last-used org stored in browser `localStorage`, not the `default_org_id` preference — a multi-org user who never explicitly set a Default Organization will hit the selection error until they set it or pass the flag. **The API and CLI ship together:** an older CLI against the new API surfaces a generic HTTP 422 rather than the org list, so this change must roll out coordinated. (AIX-606)

### Security

- **The HTTPS gate now covers every sync, not just `init`.** AIX-339 (0.2.0) only checked the scheme at login time; if `~/.aixle-insights/credentials.json` was edited afterward (by hand, by malware, or by disk corruption) to point at a plaintext `http://` remote, nothing re-checked before the next sync sent the bearer token. `insecureHttpAllowed` is now threaded through the CLI/MCP entry points and `postEvent`/`lookupProjectByRemote`, and the `--insecure` consent given at `init` is persisted on credentials so the runtime gate can honor it. (AIX-539)
- **CLI-side Bash command scrubbing before egress.** `scrubBashCommand` redacts credential-shaped substrings from Claude `tool_use` Bash-command payloads before they leave the machine, alongside the tool_use derivative-event work below. (AIX-259)
- **Untrusted workspace paths are normalized and contained before `git` runs.** Cursor workspace folders, composer paths, hook workspace roots, and Claude transcript working directories were passed to `git -C` unvalidated, so a manipulated path could make the package read an unrelated directory's `.git/config`. Paths are now resolved and containment-checked, and the three `scopeDir` filters no longer accept `../` traversal (they were plain string-prefix matches, and were also incorrect on Windows). A path rejected at the spawn boundary loses project attribution only; a path rejected by scope containment skips the turn/payload/event outright. (AIX-547)
- **Argv option injection in `git`/`ssh` calls is rejected.** An SSH host alias or repo path beginning with `-` was passed straight through to `execFileSync`, where the child process could parse it as a command-line option instead of a value. (AIX-546)
- **Present-but-invalid credential/config/state files are now visible too.** AIX-558 made *broken JSON* visible, but a file could still be valid JSON of the wrong shape (`{"foo":1}`, a state object missing `version`/`sessions`, a config that is a JSON array) and fall back to "treat as absent" silently — so a plausible-looking replacement was indistinguishable from a never-initialized machine. Those rejections now warn as well. The four event names are unchanged; each carries a `reason` field of `invalid_json` (the payload did not parse) or `invalid_shape` (it parsed but was rejected by validation), following the existing `reason` convention used by `credential_validation_failed` and `hook_event_dropped`. Config now also rejects JSON arrays explicitly — `typeof [] === "object"` previously let them reach the happy path and be handed to the pricing parser. Absent files, an unavailable or disabled keychain, and every fallback value are unchanged; log fields still carry only the path (or keychain service) and a short reason. (AIX-699)
- **`invalid_json` no longer risks echoing secret content, and no longer conflates I/O errors with parse errors.** `JSON.parse`'s `SyntaxError` message can embed a prefix of the raw input (`JSON.parse("example_local_fixture_1234567890")` → `` Unexpected token 'e', "example_lo"... is not valid JSON ``), so logging it verbatim on a corrupt credentials/keychain/config/state payload could leak exactly the secret content these events exist to describe without exposing. All four `invalid_json` sites now route through `src/lib/parse-error.ts`, which reports a `SyntaxError`'s name only, never its message; a non-parse error (fs I/O — `EACCES`, `EISDIR`) is reported by its errno `code` under `reason: "unreadable"` instead of being mislabeled `invalid_json`. Found in code review of PR #496. (AIX-699)
- **Parse failures on local credential/config/state files are now visible.** A present-but-corrupt `credentials.json`, OS-keychain entry, `config.json`, or sync-state file failed silently and was indistinguishable from a file that was never created, so tampering left no trace. Each now emits a warn to `mcp.log` (`credentials_parse_failed`, `credentials_keytar_parse_failed`, `config_parse_failed`, `state_parse_failed`) carrying only the path (or keychain service name) and the parser's error message — never file contents or tokens. Absent files stay silent, keytar being unavailable stays silent, and every fallback is unchanged: `null` credentials, `{}` config, fresh state. (AIX-558)
- **Dependency-advisory CI gate.** Every push now runs `npm audit --audit-level=high`
  and `npm audit signatures` over the workspace. Previously the only dependency check
  was `npm audit signatures` at release time. (AIX-559)
- **`glob` upgraded to `^13`**, closing a high-severity `brace-expansion` DoS pair that
  shipped to every consumer through `glob@10 → minimatch@9`. There was no in-range fix.
  Drops 28 packages (glob's CLI dependencies) from the production tree; `glob.sync` is
  unchanged in v13. (AIX-559)
- **Security linting.** `eslint-plugin-security` runs in CI. Twelve rules are errors;
  `detect-non-literal-fs-filename` and `detect-object-injection` are off by
  measurement — see `ARD.md` §4 decision I. (AIX-559)
- **CI no longer executes dependency lifecycle scripts.** The Linux lane installs with
  `npm ci --ignore-scripts` and re-allows only `better-sqlite3`, matching the release
  workflow. (AIX-559)
- **Dependency refresh** clearing the remaining advisories (`fast-uri`, `postcss`,
  `@hono/node-server`, `@modelcontextprotocol/sdk`). Lockfile-only. (AIX-559)
- `loadCredentials` now reads the OS keychain **first**, falling back to `credentials.json` only when the keychain is disabled (`DB90_MCP_DISABLE_KEYTAR`), unavailable, or empty — so a stale or manually-created file can no longer silently shadow the secure keychain entry. A lingering file alongside a populated keychain entry is logged as drift and ignored. Previously-silent credential-cleanup failures (file removal, keychain deletion) are now logged. (AIX-336)
- The Windows fallback `credentials.json` is now best-effort ACL-locked via `icacls` (Node's `chmod`/`mode` cannot set NTFS ACLs). README's **State + credentials** section documents per-OS storage behaviour — macOS Keychain and Windows Credential Manager reliably present, Linux Secret Service often absent on headless/CI/Docker. (AIX-336)

### Changed

- **MCP tool names rebranded**: `db90_status`, `db90_sync_now`, `db90_authenticate` are renamed to `aixle_insights_status`, `aixle_insights_sync_now`, `aixle_insights_authenticate` to match the `@aixle/insights` / Aixle Insights branding. The old `db90_*` names remain registered as deprecated aliases (same behavior, description notes the replacement) for one release and will be removed in a follow-up. (AIX-569)

### Added

- Claude transcript sync emits derivative events (`edit` / `commit` / `test` / `tool_use`) per non-navigation `tool_use` block; parent chat retains full cost and derivative children use `cost_model: derivative`. A turn is checkpointed only after every parent/derivative POST succeeds; if a child fails, the next sync retries the full turn (no partial checkpoint). Already-landed payloads are safe on retry because ingest upserts by `metadata.session_id`. (AIX-259)

### Fixed

- **Cursor transcript `occurred_at`**: turns no longer all inherit the session `lastUpdatedAt` / file mtime. Prefer per-message `timestamp` / `unixMs` / `createdAt` when present on the JSONL line; otherwise spread turns across composer `createdAt`→`lastUpdatedAt` so first-sync backfill does not spike a single calendar week on Usage charts. (AIX-605)
- Cursor 1.6+ users no longer show `model: "unknown"` on every event. `readCursorActiveModel()` now chains `settings.json` (pre-1.6 location) with a new `state.vscdb` fallback (`cursorDiskKV` table, most-recently-touched `composerData:<composerId>` row's `modelConfig.modelName`, falling back to `modelConfig.selectedModels[0].modelId`), opened only via the existing root-contained `openCursorSqliteReadonly`. Daily-stats, recent-commit, and transcript payloads now carry a `model_resolution` metadata field (`"settings_json"` / `"state_vscdb"` / `"unresolved"`) recording where the model was found. (AIX-540)
- **Cursor workspace discovery returned nothing on Windows.** `findCursorDbs` and
  `findStateVscDbs` built their glob patterns with `path.join`, which emits `\` on
  Windows — and glob treats `\` as an escape character on every platform, so the
  pattern matched nothing. `findStateVscDbs` still returned the `globalStorage`
  path unconditionally, so it looked like it worked while silently dropping every
  per-workspace `state.vscdb`, and with it workspace-scoped project attribution.
  Both now use a forward-slash pattern rooted by `cwd`, matching the two call
  sites that were already correct. (AIX-559)
- **A local sync-state file was tracked in git** (`state-localhost-523d45af.json`,
  two Claude Code session UUIDs). Untracked, and the ignore rules moved into the
  package so a folder rename cannot orphan them again. (AIX-559)
- **Node floor corrected** in `README.md`, `RELEASING.md` and the lockfile to match
  `engines.node` (`>=20.19.0`); a test now fails if the four copies drift. (AIX-559)

### Internal

- Removed `packages/tools/aixle-insights/.npmrc`. npm ignores `.npmrc` inside a
  workspace member, so it was inert and printed a warning on every npm command; the
  guarantee it documented is enforced by the release workflow's lifecycle-script
  allowlist. Rationale preserved in `ARD.md`. (AIX-559)

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
