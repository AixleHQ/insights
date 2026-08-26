# @aixle/insights

stdio **MCP server** for AI coding-assistant telemetry. Ingests Claude Code JSONL transcripts and Cursor IDE SQLite telemetry into your organization's ingest API, exposes operator tools on the MCP bridge, and pairs with `aixle-insights init` so teammates can onboard without juggling cron jobs or brittle shell hooks.

## Architecture reference

For implementation architecture, design decisions, and package direction, see [`ARD.md`](./ARD.md).

## Choosing a version

Two channels are published. Pick one deliberately — they are **not** interchangeable.

| | Production | Staging (QA) |
|---|---|---|
| Install | `npm i -g @aixle/insights` | `npm i -g @aixle/insights@staging` |
| Version looks like | `0.2.1` | `0.2.6-staging` |
| Points at | the production API | the staging API |
| Who should use it | **everyone** | QA validating unreleased work |
| Stability | released, supported | may change or break without notice |

### Production — use this unless told otherwise

```bash
# One-shot via npx (recommended — always pulls the current release):
npx -y @aixle/insights init \
  --host https://insights.example.com \
  --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM

# Or global install:
npm i -g @aixle/insights
npm ls -g @aixle/insights   # e.g. @aixle/insights@0.2.1  (no suffix)
```

### Staging — QA only

Staging builds carry a `-staging` suffix and live on the `staging` dist-tag. You must ask for
them explicitly; a plain `npm install` will never give you one.

```bash
# One-shot via npx:
npx -y @aixle/insights@staging init \
  --host https://staging.insights.example.com \
  --keycloak-url https://YOUR-STAGING-KEYCLOAK/realms/YOUR_REALM

# Or global install:
npm i -g @aixle/insights@staging
npm ls -g @aixle/insights   # e.g. @aixle/insights@0.2.6-staging  (note the suffix)
```

Point a staging build at the **staging** API host. Sending staging telemetry to production
pollutes production analytics.

### Which one do I have?

```bash
npm ls -g @aixle/insights                # a -staging suffix means a QA build
npm view @aixle/insights dist-tags       # what each channel currently resolves to
```

Expected output — `latest` and `staging` move independently:

```
{ latest: '0.2.1', staging: '0.2.6-staging' }
```

### Switching back to production

```bash
npm i -g @aixle/insights@latest
```

Then re-run `init` against the production host, since credentials and the MCP entry are
per-host.

> **Why `npm install` never surprises you with a staging build:** `-staging` versions are semver
> prereleases, and no ordinary version range resolves to a prerelease. `*`, `^0.2.1`, `~0.2.1`
> and `>=0.1.0` all select `0.2.1` even when `0.2.6-staging` exists. Staging builds are
> reachable only by exact version or the `staging` dist-tag.

Maintainers: see [`../RELEASING.md`](../RELEASING.md) for how each channel is cut.

## Install

```bash
# One-shot via npx (recommended — always pulls the latest):
npx -y @aixle/insights init \
  --host https://YOUR-API-HOST \
  --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM

# Or global install:
npm i -g @aixle/insights
aixle-insights init --host https://YOUR-API-HOST --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM
```

`init` performs a Keycloak device login, stores credentials locally (OS keychain via `keytar` when available, otherwise `~/.aixle-insights/credentials.json` mode 0600), and merges the MCP server entry into `~/.claude.json` under `mcpServers.aixle-insights`.

After `init` succeeds:

1. **Restart Claude Code** — it discovers the new MCP server on the next launch.
2. Open Claude Code; confirm `/mcp` lists **aixle-insights**.
3. During a Claude session invoke the **`aixle_insights_status`** MCP tool (or `aixle-insights health` from the shell) to see connectivity + last sync metadata.

## Multi-org

If your account belongs to a **single** organization, `init` binds that org automatically — no flag, zero friction.

If your account belongs to **more than one** organization, `init` needs to know which org to bind. It resolves the target in this order:

1. `--organization-id <uuid>` flag (or `DB90_ORGANIZATION_ID` env var), or
2. your **Default Organization** preference from the web app.

If neither is set, `init` **does not** guess. It prints the organizations you belong to and exits non-zero without saving credentials:

```
Multiple organizations found — choose one to bind this install:
  - Acme Corp (b1e2...  ) — owner
  - Contoso (c3d4...  ) — member
Then either:
  1. Re-run init with --organization-id <uuid> (completes device login again), or
  2. Set a Default Organization in web Preferences, then re-run init.
```

Because credentials are only persisted on success, re-running `init` means completing the Keycloak device login again.

To scope explicitly:

```bash
npx -y @aixle/insights init \
  --host https://YOUR-API-HOST \
  --keycloak-url https://YOUR-KEYCLOAK/realms/YOUR_REALM \
  --organization-id <uuid>
```

You can also set `AIXLE_INSIGHTS_ORGANIZATION_ID=<uuid>` (or the deprecated `DB90_ORGANIZATION_ID`) in your shell environment, or pin it via `mcpServers.aixle-insights.env` in `~/.claude.json`. The CLI flag overrides the env var when both are set.

Once `init` succeeds it reports the bound org (`Credentials saved (organization <uuid>).`), and `aixle-insights health` (or the `aixle_insights_status` MCP tool) shows the bound `organization_id`.

> **Preferences caveat — this is non-obvious.** The web app's "current org" (the one you appear to be viewing) is normally the **last-used** org, remembered in your browser's `localStorage`. That is **not** the same as your **Default Organization** preference, which is what `init` reads. A multi-org user who has switched orgs in the UI but never explicitly set **Default Organization** in web Preferences has no server-side preference for `init` to use — so `init` will hit the org-selection error above until you either set the Default Organization preference or pass `--organization-id`.

## Cursor hooks (optional)

**Claude Code needs nothing beyond `init`** — the MCP transcript reader already captures model, token counts (including cache tokens), prompt and assistant text, risk scan, and tool uses.

Cursor is different: its local store does not reliably record *which model* answered a turn, so events can land with `model: "unknown"`. Two things address it — the automatic `state.vscdb` fallback (AIX-540), and this opt-in hook forwarder for per-turn attribution captured as it happens:

```bash
npx -y @aixle/insights init --hooks --tool-name cursor --host <host> --keycloak-url <realm>

aixle-insights verify-hooks     # JSON: installed? queue depth?
aixle-insights uninstall-hooks  # remove, restoring the ~/.cursor/hooks.json backup
```

**Restart Cursor afterwards** — hooks are read at launch. The forwarder appends redacted payloads to `~/.aixle-insights/hooks-queue.ndjson`, which the next sync drains, so events arrive on the normal cycle rather than instantly.

> Editor-level hooks (`~/.claude/settings.json` `PostToolUse` / `Stop`) are a **fallback for environments that cannot run an MCP server**, not an upgrade. They carry no model, token, or cost data, so the MCP path is strictly better wherever it is available.

## Ingest tokens and rotation

`init` mints an ingest token per tool — distinct from your Keycloak login — and stores it in the **OS keychain** (service `aixle-insights`), falling back to `~/.aixle-insights/credentials.json` at mode 0600 where no keychain is available. Tokens are `aixle_<64 hex>` and the server retains only a SHA-256 hash, so a token cannot be recovered after `init`; losing it means re-running `init`.

You never need to paste a token for the MCP path — `init` obtains its own.

> **Rotation policy: TBD.** There is no self-service rotation command and no documented expiry or cadence. Placeholders until an owner defines them:
>
> | | Placeholder |
> |---|---|
> | Token lifetime | _undefined — tokens do not self-expire today_ |
> | Rotation cadence | _TBD_ |
> | Who can revoke | _TBD — no CLI path; server-side only_ |

**If a token is revoked, rotated server-side, or invalidated by a redeploy**, every sync fails with `HTTP 401` while `health` still reports `authenticated: true` — that flag only covers the OIDC login. Clear the stored credential and re-run `init`; state files are preserved, so already-sent sessions stay deduped:

```bash
security delete-generic-password -s "aixle-insights" -a "aixle-insights-ingest-credential"  # macOS
rm -f ~/.aixle-insights/credentials.json
# then re-run init
```

## Commands

| Command | What it does |
|---|---|
| `aixle-insights run` | Start the MCP stdio server (the default; spawned by Claude Code on demand). |
| `aixle-insights run --once` | Perform one multi-tool sync, exit. Useful for cron / manual flushes. |
| `aixle-insights run --once --full` | Backfill: ignore Cursor watermarks and commit-hash dedupe. |
| `aixle-insights init` | Keycloak device login + persist credentials + merge `~/.claude.json` entry. |
| `aixle-insights init --host <url>` | Use an Aixle Insights API origin for token exchange. Remote hosts must use HTTPS; `http://localhost` and loopback addresses are allowed for local development. |
| `aixle-insights init --insecure --host http://...` | Allow a remote plaintext HTTP host for a trusted non-production test endpoint. Prints a warning because tokens and telemetry can be exposed. |
| `aixle-insights init --hooks --tool-name cursor` | Also install the Cursor-side hook forwarder (opt-in; requires Cursor restart). |
| `aixle-insights init --force` | Re-run `init` even when credentials already exist — re-mints ingest tokens and re-writes the MCP entry. Use after changing host, org, or realm. |
| `aixle-insights init --tool-name <tool>` | Scope `init` to a single connector. **Omit it** so one login covers both Claude Code and Cursor. |
| `aixle-insights uninstall-hooks` | Remove the hook forwarder + restore `~/.cursor/hooks.json` backup. |
| `aixle-insights verify-hooks` | Print hooks install status + queue depth as JSON. |
| `aixle-insights health` | Multi-line diagnostic (credentials, sync, log path, state files). |

## Environment

| Variable | Purpose |
|---|---|
| `AIXLE_INSIGHTS_API_URL` (deprecated: `DB90_API_URL`) | API origin for ingestion + MCP exchange (defaults to `http://localhost:3000`; `init --host` overrides). |
| `KEYCLOAK_ISSUER` / `AIXLE_INSIGHTS_KEYCLOAK_ISSUER` (deprecated: `DB90_KEYCLOAK_ISSUER`) | Realm issuer URLs (`KEYCLOAK_ISSUER` is preferred on servers + CI). |
| `AIXLE_INSIGHTS_KEYCLOAK_CLIENT_ID` (deprecated: `DB90_KEYCLOAK_CLIENT_ID`) | Defaults to `db90-web`; must allow device authorization in Keycloak. |
| `AIXLE_INSIGHTS_ORGANIZATION_ID` (deprecated: `DB90_ORGANIZATION_ID`) | Optional UUID scoping `init` to that org membership (header `X-Organization-ID`). |
| `AIXLE_INSIGHTS_HOME` | Override the local state directory (defaults to `~/.aixle-insights/`). |
| `DB90_MCP_DISABLE_KEYTAR` | Set to skip the OS keychain entirely and use the `credentials.json` fallback. Useful on headless Linux/CI/Docker where Secret Service is absent. |
| `DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT` | Default the Keycloak issuer to the local stack (`http://localhost:8080/realms/db90`) so `--keycloak-url` can be omitted during local development. |
| `DB90_CLAUDE_USER_CONFIG_PATH` | Override the path to `~/.claude.json` that `init` merges the MCP entry into. Primarily a test seam; also lets you target a non-default Claude Code profile. |

Also read, but not intended as user-facing configuration: `APPDATA` and `XDG_CONFIG_HOME` (platform config-directory discovery) and `NODE_ENV`.

Remote API and ingest hosts must use `https://`. Plaintext `http://` is local-dev-only for `localhost`, `127.0.0.0/8`, and `[::1]`; those loopback URLs work without warnings. A remote `http://` host is rejected during `init` unless you pass `--insecure`, which should only be used for trusted non-production test endpoints and will print a warning because ingest tokens and telemetry can cross the network unencrypted.

Note: the `DB90_*` variables above are deprecated aliases for the `AIXLE_INSIGHTS_*` names (branding rename, AIX-624). Both are honored indefinitely — the `AIXLE_INSIGHTS_*` name wins when both are set — but using a `DB90_*` name prints a one-line deprecation warning to stderr. There is no removal date yet; this table will be updated when one is set.

Optional `~/.aixle-insights/config.json` accepts Cursor line-cost overrides (per-model rates):

```json
{
  "cursor": {
    "line_costs": {
      "claude-sonnet-4-5": { "input_per_line": 0.0002, "output_per_line": 0.0008 }
    }
  }
}
```

### Configuration reference

`~/.aixle-insights/config.json` is optional — `init` does not create it. Every key is optional too.

| Key | Type | Purpose |
|---|---|---|
| `host` | string | Ingest API origin. Same value as `--host`. |
| `token` | string | Ingest token. Rarely needed — `init` stores tokens in the keychain instead, and this is the plaintext alternative. |
| `project_id` | string | Pin every event to one project instead of resolving from the git remote. |
| `cursor.line_costs.<model>` | `{ input_per_line, output_per_line }` | Per-model cost rates for Cursor line-based accounting. |

**Precedence:** CLI flag → environment variable → `config.json`. A flag always wins; the config file is the fallback of last resort. An absent `config.json` is the normal case and is silent. A file that is present but unusable — malformed JSON, or valid JSON that isn't an object, including a **top-level array** (a common mistake when writing per-model rates) — is ignored entirely: every override falls back to its default, and a `config_parse_failed` line is written to `mcp.log` rather than a crash. Nothing is printed to the terminal, so check the log if an override appears to have no effect.

Worked example — pin a project and override Cursor rates for two models:

```json
{
  "host": "https://insights.example.com",
  "project_id": "3f6c1e28-9b4a-4c7f-8d21-5ac0e7b91f04",
  "cursor": {
    "line_costs": {
      "claude-sonnet-4-5": { "input_per_line": 0.0002, "output_per_line": 0.0008 },
      "gpt-4o":            { "input_per_line": 0.0001, "output_per_line": 0.0004 }
    }
  }
}
```

## Clean slate — full uninstall / reset

Use this when a breaking change lands, when switching between the production and staging channels, or when you want to prove a problem is not stale local state. Steps are ordered least to most destructive; stop wherever your problem clears.

**1. Remove editor integration**

```bash
aixle-insights uninstall-hooks           # Cursor hook forwarder + restore ~/.cursor/hooks.json backup
```

Then delete the `mcpServers.aixle-insights` entry from `~/.claude.json` by hand (`init` writes it; there is no command to remove it).

**2. Clear credentials** — forces a fresh `init` and re-mints ingest tokens:

```bash
security delete-generic-password -s "aixle-insights" -a "aixle-insights-ingest-credential"  # macOS
rm -f ~/.aixle-insights/credentials.json
```

**3. Reset sync state** — ⚠️ **this is the destructive one.** State files hold the watermarks and dedupe checkpoints. Deleting them makes the next sync treat all local history as new, so you get a **full re-backfill**. Ingest upserts by `metadata.session_id`, so you should get updates rather than duplicates, but volume will spike:

```bash
rm -f ~/.aixle-insights/state-*.json
rm -f ~/.aixle-insights/state.lock          # only if no `aixle-insights run` is alive — check with: pgrep -fa aixle-insights
rm -f ~/.aixle-insights/hooks-queue.ndjson  # discards hook events not yet drained
```

**4. Nuclear** — remove everything the package created locally:

```bash
rm -rf ~/.aixle-insights/    # credentials, state, logs, hook queue
npm uninstall -g @aixle/insights
```

Nothing here touches your Claude Code transcripts or Cursor's own store — those belong to the editors and are only ever read. Events already delivered to the server are unaffected; this is purely local state.

| Artifact | Created by | Removed in step |
|---|---|---|
| `~/.aixle-insights/credentials.json` / keychain entry | `init` | 2 |
| `~/.aixle-insights/state-<host>-<hash>.json` | first sync | 3 |
| `~/.aixle-insights/state.lock` | `run` | 3 |
| `~/.aixle-insights/hooks-queue.ndjson` | hook forwarder | 3 |
| `~/.aixle-insights/mcp.log`, `mcp.log.1` | any run | 4 |
| `~/.cursor/hooks.json` entry | `init --hooks` | 1 |
| `mcpServers.aixle-insights` in `~/.claude.json` | `init` | 1 (manual) |

## Security

`@aixle/insights` enforces HTTPS for any remote host. Plaintext `http://` is allowed only for loopback (`localhost`, `127.0.0.0/8`, `[::1]`) so that local-dev flows against `make up` continue to work without friction.

### Three gates

| Gate | Where it fires | What it checks |
|---|---|---|
| CLI `--host` gate | `runInit()` at the top of `aixle-insights init`, before any network call to Keycloak | The `--host` value the user typed |
| Post-exchange `ingestHost` gate | `auth/flow.ts`, immediately after the OIDC-for-ingest-token exchange returns, before persisting credentials to the keychain | The `ingestHost` returned by the server, in case it differs from `--host` |
| Runtime send/lookup gate | `lib/client.ts`'s `postEvent` and `lib/project-resolver.ts`'s `lookupProjectByRemote`, immediately before every ingest POST and project-attribution GET | The `host` loaded from stored credentials, on **every** sync cycle — not just at `init` |

All three gates use the same pure utility, `evaluateTransportSecurity()` in `src/lib/transport-security.ts`. The first two rejecting aborts `init` with exit code 1 and a single-line error naming the offending host. The third rejecting drops that send/lookup (logged via `console.error`, no retry) without aborting the whole sync cycle — a single tampered credential shouldn't crash background sync, it should just refuse to leak the token.

The runtime gate exists because `init`'s two gates only run once, at login time. If `~/.aixle-insights/credentials.json` is edited afterward (by hand, by malware, or by disk corruption) to point at a plaintext `http://` remote, nothing previously re-checked the scheme before every subsequent sync sent the bearer token — AIX-539 closed that gap.

### `--insecure` (init-only, consent persists to runtime)

`aixle-insights init --insecure --host http://<remote>` downgrades the first two gates from "reject" to "warn + continue." It is intended only for trusted non-production test endpoints (e.g. a self-hosted staging on a private network without a TLS cert).

`--insecure` is rejected on the `run` subcommand by design — the long-running MCP server should never run insecurely, and since `run` is normally spawned non-interactively (by Claude Code, via `~/.claude.json`), there is no ergonomic way to pass a flag to it per-cycle anyway. Instead, when `init --insecure` is used, that consent is recorded as `insecureHttpAllowed: true` on the stored credential (`StoredCredentials.insecureHttpAllowed` in `auth/credentials.ts`) and every later `run` reads it back — so a legitimately-approved trusted HTTP endpoint keeps syncing normally. A `credentials.json` that has an `http://` remote host **without** this flag set (e.g. because someone hand-edited the file after the fact, bypassing `init` entirely) is rejected by the runtime gate on every send.

### What is NOT gated

The Keycloak issuer URL (`--keycloak-url` / `KEYCLOAK_ISSUER`) is **not** TLS-gated by this package. Same threat model, different ticket — tracked separately. For now, use HTTPS for any remote Keycloak issuer; the OIDC device-flow library will fail the request if the cert is invalid, but it will not refuse to attempt plaintext.

### Local store integrity

Transport security covers data in flight. The other half of the threat model is what the package
reads back off the local machine: credentials (keychain or file), `config.json`, and state files are
all attacker-writable if the account is compromised, so none of them is trusted on read.

Each is validated every time it is loaded. A payload that fails to parse, or that parses but does
not match the expected shape, is **rejected** and the caller falls back to its documented default —
no credentials, no config overrides, fresh state. Every rejection is recorded in `mcp.log`, so a
corrupted or tampered store is distinguishable from one that was never created; before this, both
were silent and looked identical to a fresh install. See
[Diagnostics](#diagnostics) for the event names.

Log fields carry only the file path (or the keychain service name) and a short machine-readable
reason. File contents, keychain payloads, and tokens are never logged.

## Cursor hook forwarder (opt-in)

`aixle-insights init --hooks --tool-name cursor` installs a Node script as a Cursor hook (`~/.cursor/hooks.json`). The script appends redacted hook payloads to `~/.aixle-insights/hooks-queue.ndjson`; the background sync drains the queue on its next cycle and POSTs the events with accurate per-turn model attribution. Requires a Cursor restart after install. To remove, run `aixle-insights uninstall-hooks` and restart Cursor again.

## State + credentials

- **App home directory**: `~/.aixle-insights/` (override with `AIXLE_INSIGHTS_HOME`).
- **Credentials**: the OS keychain is the source of truth. On read, the keychain is consulted **first**; the file is only a fallback when the keychain is unavailable, empty, or explicitly disabled (`AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR`, or the deprecated `DB90_MCP_DISABLE_KEYTAR`). On write, credentials go to the keychain and the file is removed when the keychain write succeeds.
- **State files**: `state-<hostname>-<token-hash>.json` per credential, plus `state.lock` advisory lock, `mcp.log` rotating diagnostic log, optional `hooks-queue.ndjson`.

### Credential storage by OS

The secure store is the platform's native keychain, accessed via `keytar` (service `aixle-insights`):

| OS | Secure store | Availability | Fallback file protection |
| --- | --- | --- | --- |
| **macOS** | Keychain | reliably present | `credentials.json` written `chmod 0600` |
| **Windows** | Credential Manager | reliably present | `credentials.json` best-effort locked via `icacls` (Node `chmod` cannot set NTFS ACLs) |
| **Linux** | Secret Service (libsecret / GNOME Keyring / KWallet) | **often absent** on headless servers, minimal Docker images, and CI — no D-Bus secret service | `credentials.json` written `chmod 0600` |

Notes:

- **Windows**: don't set `AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR` (or the deprecated `DB90_MCP_DISABLE_KEYTAR`) — Credential Manager is reliably present, and the plaintext fallback file cannot be locked down as tightly as the keychain. The `icacls` hardening is best-effort defense-in-depth.
- **Linux**: when no Secret Service is running (common in headless/CI/container contexts), the tool degrades to the `chmod 0600` fallback file **by design** — this is the one environment where the file path is routinely exercised, and POSIX permissions protect it there.
- A stale `credentials.json` sitting alongside a populated keychain entry is logged as drift (`credentials_file_shadowed_by_keychain` in `mcp.log`) and ignored in favour of the keychain.

The internal state-file shape is implementation-detail; don't depend on it from outside this package.

## Diagnostics

```bash
aixle-insights health        # connectivity + last sync metadata
aixle-insights verify-hooks  # JSON: hooks installed + queue depth
```

`mcp.log` (rotates at 5 MiB to `mcp.log.1`) under the app home directory captures operational events. Inside Claude Code, the **`aixle_insights_status`** MCP tool returns the same diagnostic structure as `aixle-insights health`.

### Local-store integrity events

These four are the only signal that a local store was present but unusable — `health` and
`aixle_insights_status` do **not** report them, so `mcp.log` is the sole surface:

| Event | Fires when |
|---|---|
| `credentials_parse_failed` | `credentials.json` exists but was rejected |
| `credentials_keytar_parse_failed` | the OS keychain entry exists but was rejected |
| `config_parse_failed` | `config.json` exists but was rejected |
| `state_parse_failed` | a state file exists but was rejected |

Each carries a `reason` distinguishing the two failure modes:

- `invalid_json` — the payload did not parse at all.
- `invalid_shape` — it parsed, but validation rejected it: credentials with no usable token, a
  `config.json` that is a JSON array, a state file missing `version` / `sessions`, and so on.

Three properties are worth relying on:

- An **absent** file never warns. That is the everyday case (most users never create a
  `config.json`, and every machine starts with no state file), so a warning always means something
  is actually there and wrong.
- A **missing or disabled OS keychain** never warns either — falling back to the file is expected
  on headless Linux, CI, and containers, not an error.
- All four are written to the log **only**, never mirrored to stderr, because stray output on the
  stdio transport corrupts the MCP protocol. Emitting a warning never changes the fallback the
  caller returns.

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| `Error: Aixle Insights API host <name> uses remote plaintext HTTP.` | You passed `--host http://<remote>` without `--insecure`. | Use `https://...`, or add `--insecure` if you know the endpoint is trusted and non-production. |
| `Blocked event send — Aixle Insights ingest host <name> uses remote plaintext HTTP.` (or `Blocked project lookup — ...`) in `mcp.log` / console during `run` | `credentials.json` (or the keychain entry) has an `http://` remote `host` without a recorded `--insecure` consent — most likely because it was edited outside of `init`. | Re-run `aixle-insights init --host https://... ` (or `init --insecure --host http://...` if the endpoint is genuinely trusted non-prod) to re-establish credentials with an explicit, recorded decision. |
| `Auth failed: fetch failed` during `init` | The `--keycloak-url` host doesn't resolve (NXDOMAIN), is behind a VPN, or the TLS cert is bad. | Verify with `curl -sS https://<host>/realms/<realm>/.well-known/openid-configuration`. For Aixle Insights staging, the canonical Keycloak URL is embedded in the SPA — `curl https://<APP_HOST> \| grep keycloakUrl` extracts the current value. |
| `Failed to post event: HTTP 401 Unauthorized` repeated for every turn | Your saved ingest token has been rotated, revoked, or invalidated by a server redeploy. The ingest token is distinct from the Keycloak access token that `health` reports as `authenticated: true`. | Reset the keychain entry and re-run `init`: `security delete-generic-password -s "aixle-insights" -a "aixle-insights-ingest-credential"` then `rm -f ~/.aixle-insights/credentials.json` then `aixle-insights init --host ... --keycloak-url ...`. State files are **not** deleted, so already-sent sessions stay deduped. |
| `health` shows `authenticated: true` but `last_result` is `sent: 0, failed: N` cycle after cycle | Same as the 401 row above. `authenticated` only proves the OIDC token was acquired, not that the ingest token still validates server-side. | Re-init as above. |
| `last_result` reports `sent: N` but the Events UI shows nothing | The Temporal worker is not running. The ingest endpoint returns HTTP 202 (queued) regardless of worker state. | `make worker` (or check `docker ps` for `db90-worker`). See [LOCAL-DEV.md](./LOCAL-DEV.md) §1. |
| `sync_lock_skip {reason: "advisory_lock_held"}` in the log | Another sync cycle is still holding `~/.aixle-insights/state.lock`. | Wait for it to finish; only delete the lock file (`rm -f ~/.aixle-insights/state.lock`) after confirming no `aixle-insights run` process is alive (`pgrep -fa aixle-insights`). |
| `health` reports `authenticated: false` right after a successful `init`, and `credentials_parse_failed` or `credentials_keytar_parse_failed` is in the log | The credential store exists but was rejected, so it is treated as absent. The `reason` field says whether it failed to parse (`invalid_json`) or parsed into the wrong shape (`invalid_shape`). | Re-run `init`. If you hand-edited `credentials.json` for local testing, remember the keychain is read **first** — see [State + credentials](#state--credentials). |
| A `config.json` override has no effect, and `config_parse_failed` is in the log | The file is malformed, or is valid JSON that is not an object — a top-level array is the usual mistake. | Fix it to match the shape under [Environment](#environment); until it parses, every override is ignored. |
| Sync re-sends history that was already delivered, and `state_parse_failed` is in the log | A state file was present but rejected, so sync fell back to fresh state and lost its dedup checkpoints. | This is recovery, not a loop — the next successful cycle writes valid state. Ingest upserts by session, so duplicates are absorbed. Worth investigating what wrote the bad file. |
| `aixle-insights --help` doesn't list `--insecure` | You're running an older published version of the package, not the local source. | `which aixle-insights` shows the path. To run local source: `cd packages/tools/aixle-insights && npm run build && npm link`. To return to the published version: `npm unlink -g @aixle/insights && npm install -g @aixle/insights@latest`. |
| Not sure whether `aixle-insights` is a `npm link` or a real install | Real installs are regular files; `npm link` is a symlink chain into the repo. | `readlink "$(which aixle-insights)"` shows the link target if any. A linked install will trace back to a path under your monorepo checkout. |

## Local development — `/aixle-reset` skill

> Audience: contributors editing this package. If you installed `@aixle/insights` from npm and aren't modifying the source, you can skip this section.

When you iterate on `src/` against a real Claude Code or Cursor session, the running MCP routinely drifts out of sync with the code you just wrote. Common causes:

- Rebuilt `dist/` but never restarted the long-lived MCP process — your changes aren't in memory.
- `~/.claude.json` accumulated both `mcpServers.insights` and `mcpServers.aixle-insights` (or a legacy `mcpServers.db90`), and Claude Code spawned the wrong one.
- The MCP launched from a non-git-rooted `cwd` (e.g. `~/`), so pre-resolution returned `project_id: null` and every turn in that session inherited it.

The repo ships a Claude Code skill, **`/aixle-reset`** (lives at `.claude/skills/aixle-reset/SKILL.md`), that restores known-good local state in one shot.

It runs `scripts/reset-local-env.mjs`, which:

1. Stops any running `aixle-insights/dist/cli.js run` process.
2. Rebuilds `dist/` if anything in `src/` is newer.
3. Repairs `~/.claude.json` and `~/.cursor/mcp.json` so the entries point at `node <abs path>/dist/cli.js run`, stripping duplicate `insights` and legacy `db90` keys. Backs up each file it modifies.
4. Warns non-blockingly about leftover direct-curl ingest hooks in `~/.claude/settings.json` and stale `@db90/*` npm globals.
5. Restarts the MCP from the repo root so pre-resolution finds the project from `git remote`.
6. Waits up to 30 s for the first `project_attribution_resolved` log line and asserts `project_id` is non-null.

Invoke manually:

```bash
node packages/tools/aixle-insights/scripts/reset-local-env.mjs
```

Or, inside Claude Code, run the **`/aixle-reset`** skill.

A `PostToolUse` hook (`.claude/hooks/on-aixle-insights-edit.ts`) **suggests** running the skill whenever you edit a file under `packages/tools/aixle-insights/**` (excluding `dist/`, `*.md`, and any test path). The hook is advisory only — it never auto-executes, so you can iterate freely and reset when you're ready to test end-to-end.

After the script reports success: **quit and reopen Claude Code / Cursor** so each IDE re-spawns its own MCP from the now-canonical config. The MCP the script started manually keeps running standalone and will still sweep transcripts correctly until you replace it.

## Requirements

- Node.js >= 20.19.0 — matches `engines.node` in `package.json`, and
  `src/test/supply-chain-contract.test.ts` fails if the two drift apart. Older
  20.x patch releases are not supported.
- macOS / Linux / Windows. On Windows, the package writes a `cmd /c npx …` wrapper in `~/.claude.json` so Claude Code can spawn the MCP server reliably.
- `better-sqlite3` is a native module. After a Node upgrade, if SQLite reads start failing, rebuild it from the tools workspace:

```bash
cd packages/tools
npm rebuild better-sqlite3
```

## Changelog

See [CHANGELOG.md](https://github.com/AixleHQ/insights/blob/develop/packages/tools/aixle-insights/CHANGELOG.md) — npm's registry page doesn't render this file directly, so it's linked here instead of duplicated.

## License

MIT.
