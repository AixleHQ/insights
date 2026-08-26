# @aixle/insights ARD

Architecture Reference Document for the `@aixle/insights` npm package.

## 1) Purpose

`@aixle/insights` is a local-first telemetry connector that:

- collects AI coding-assistant activity from Claude Code and Cursor,
- normalizes events into Aixle Insights ingest payloads,
- and exposes operational controls through an MCP stdio server.

The package is designed so a teammate can run a single `init` flow and then rely on background sync, instead of custom cron jobs, shell scripts, or manual exports.

## 2) Product Scope

### In scope

- CLI workflows (`init`, `run`, `run --once`, `health`, hooks install/uninstall/verify).
- MCP tools:
  - `aixle_insights_status`
  - `aixle_insights_sync_now`
  - `aixle_insights_authenticate`
  - Deprecated aliases, still registered and functional, slated for removal in a later release
    (AIX-569): `db90_status`, `db90_sync_now`, `db90_authenticate`
- Multi-source ingestion:
  - Claude transcript JSONL files
  - Cursor SQLite stores (`state.vscdb`, legacy `cursor.db`)
  - Cursor agent transcript files
  - Optional Cursor hook queue (`hooks-queue.ndjson`)
- Credential lifecycle via Keycloak Device Flow and Aixle Insights MCP token exchange.
- Local state management (checkpoints, lock, retry/backoff, diagnostics).

### Out of scope

- Aixle Insights backend processing/storage internals after `POST /api/v1/ingest/events`.
- UI/reporting concerns.
- Server-side auth policies (handled by Aixle Insights API + Keycloak).

## 3) High-Level Architecture

### Runtime layers

1. **Entry layer** (`src/cli.ts`)
   - Parses command arguments.
   - Executes one-shot flows (`init`, `health`, `run --once`) or starts MCP server (`run`).

2. **MCP layer** (`src/server.ts`)
   - Registers `aixle_insights_*` tools on stdio transport (plus deprecated `db90_*` aliases, AIX-569).
   - Runs startup sync and periodic background sync loop.

3. **Sync orchestration** (`src/sync.ts`)
   - Coordinates multi-tool sync under advisory lock.
   - Applies checkpointing, dedupe, backoff, and posting.
   - Persists operator diagnostics into credential-scoped state files.

4. **Source adapters**
   - Claude reader/mapper (`src/readers/claude.ts`).
   - Cursor readers/mappers (`src/readers/cursor.ts`, `src/collect-cursor-payloads.ts`).
   - Cursor hooks queue reader (`src/hooks/cursor-hooks-reader.ts`).

5. **Platform services**
   - Auth + credential persistence (`src/auth/*`; `src/credentials.ts` is a re-export shim).
   - Config loading (`src/lib/config.ts`, `src/cursor-config.ts`).
   - State + lock + logs (`src/state.ts`, `src/lock.ts`, `src/log.ts`).
   - HTTP posting + retries (`src/lib/client.ts`, `src/client.ts`).
   - Input-safety decision points (`src/lib/transport-security.ts`,
     `src/lib/repo-path-safety.ts`, `src/lib/spawn-arg-safety.ts`) — see decisions F and G.
   - Health snapshot (`src/health.ts`).
   - Installer flows (`src/install/claude.ts`, `src/hooks/hooks-config.ts`).

### Data flow

1. `init` performs Keycloak device authorization and exchanges for ingest token(s), binding the credential to a single organization (see decision H).
2. Credentials are saved in keychain when available, otherwise in `~/.aixle-insights/credentials.json` (mode 0600 on POSIX).
3. `run` starts MCP server and background sync.
4. Sync reads local sources, maps payloads, and posts to Aixle Insights ingest API.
5. Checkpoints/watermarks/state are persisted per credential (`state-<hostname>-<token-hash>.json`) to avoid duplicate sends.
6. Diagnostics are surfaced through `health`/`aixle_insights_status` and `mcp.log`. Note the two are
   not equivalent: the local-store rejection events from decision G land in `mcp.log` only.

## 4) Core Decisions

### A. Multi-tool credentials in one host namespace

- Stored shape is `version: 2` with `accounts` keyed by `claude_code` and `cursor`.
- Supports one auth session that provisions multiple ingest tokens.
- Keeps backwards compatibility with legacy single-token shape.

### B. Credential-scoped state files

- State is partitioned by host + token hash.
- Prevents collisions across orgs/environments/accounts.
- Preserves migration from old `state.json`.

### C. Local lock for overlapping sync protection

- Advisory `state.lock` in app dir guards against concurrent intervals/manual sync/parallel processes.
- Stale lock handling includes owner liveness checks.

### D. Best-effort delivery with resilient retries

- Per-event transient retries for 5xx/network (`1s`, `4s`, `16s`).
- 429 handling persists `rate_limited_until` so pause survives process restarts.
- Batch partial failures are tolerated and explicitly logged.

### E. Security-oriented packaging/publishing gates

- OIDC trusted publishing (no long-lived npm token by default).
- CI release workflow blocks unsafe lifecycle scripts, local dependency specs, and scope regressions.
- `npm ci --ignore-scripts` + targeted `npm rebuild better-sqlite3` reduces supply-chain risk.

### F. Containment for untrusted paths reaching subprocesses

- Repo paths come from untrusted sources: Cursor `workspace.json` (`folder`), composer
  `workspaceIdentifier.uri.fsPath`, hook `workspace_roots[0]`, and Claude transcript `cwd`.
- `src/lib/repo-path-safety.ts` is the single decision point. Two layers use it:
  - **Scope containment** (`src/sync.ts`, `src/hooks/cursor-hooks-reader.ts`) — normalized,
    `sep`-aware, realpath-resolving containment against `scopeDir` (`process.cwd()`).
  - **Spawn boundary** (`src/lib/project-resolver.ts`) — `git -C` runs only against a path that
    resolves to a real directory, and against that canonical real path.
- Spawn-boundary rejection drops project attribution only; the telemetry event is still sent.
  Scope-containment rejection skips the turn/payload/event outright.
- Mirrors the containment already applied to Cursor SQLite reads
  (`src/readers/cursor-sqlite.ts`).

### G. Local stores are validated on read, and rejections are observable

Decision F covers untrusted *paths*. This one covers the untrusted *payloads* the package reads
back from the local machine: the credential store (keychain or `credentials.json`), `config.json`,
and the credential-scoped state files. All three are writable by anything running as the user, so
none is trusted on read.

- **Validate every load.** Each loader parses, then shape-checks, and rejects anything it cannot
  use. Rejection is not an exception — `normalizeLoadedCredentials` and the config/state guards
  signal it by returning a sentinel, so the validation branch, not a `catch`, is the decision point.
- **Fall back to a documented default, never crash.** `null` credentials, `{}` config,
  fresh `{ version: 1, sessions: {} }` state. Logging never changes control flow. This mirrors F's
  explicit fallback contract.
- **Make rejection observable.** A silent fallback is the actual defect: a tampered or corrupted
  store was indistinguishable from one that was never created, which is precisely the signal an
  operator needs (AIX-558, extended to shape rejections by AIX-699). Four events —
  `credentials_parse_failed`, `credentials_keytar_parse_failed`, `config_parse_failed`,
  `state_parse_failed` — each carrying `reason: "invalid_json" | "invalid_shape"`. The `reason`
  discriminator, rather than one event name per cause, follows the convention already used by
  `credential_validation_failed` and `hook_event_dropped`.
- **Absence is not a failure.** A missing file, and a missing or disabled OS keychain, stay silent
  by design — those are normal states, and warning on them would bury the real signal. This is why
  keytar acquisition is a separate `try` from payload parsing in `tryKeytarGet`: an unavailable
  native module must not read as tampering.
- **Log file only, never stderr.** All four pass `mirrorToConsole = false`, overriding
  `mcpLog.warn`'s default, because stray output on the stdio transport corrupts the MCP protocol.
  Consequence: `mcp.log` is the sole surface — `health` / `aixle_insights_status` do not report
  these. See the README's Diagnostics section.
- **Never log payloads — including through the error message.** Fields carry the path (or
  `keytarService`) and a short reason only. `invalid_shape` never had a raw-content risk since
  rejection is signaled by a return value, not an exception. `invalid_json` did: V8's
  `JSON.parse` throws a `SyntaxError` whose message can embed a prefix of the unparsed input
  (`JSON.parse("example_local_fixture_1234567890")` → `` Unexpected token 'e', "example_lo"... is not valid JSON ``),
  which would echo exactly the secret content this decision exists to keep out of `mcp.log`.
  `src/lib/parse-error.ts` (`describeReadFailure`) is the single point that classifies a caught
  error into a safe `reason` + `error` string — a `SyntaxError` reports its name only, never
  `.message`; other errors (fs I/O — `EACCES`, `EISDIR`) report their errno `code`, which is safe
  and more actionable than a bare name. All four call sites route through it instead of each
  inlining `err.message`.

### H. Transport security enforced at every send/lookup boundary, not just at init

- `evaluateTransportSecurity()` (`src/lib/transport-security.ts`) is the single pure HTTPS-or-loopback gate, called from five places: `init`'s `--host` check, the post-exchange `ingestHost` check, `postEvent` (`lib/client.ts`), and `lookupProjectByRemote` (`lib/project-resolver.ts`).
- The last two are the *runtime* gates (AIX-539) — they re-validate the host loaded from stored credentials on every sync cycle, not just once at login, so a `credentials.json` tampered after the fact can't silently exfiltrate the bearer token over plaintext HTTP.
- User consent from `init --insecure` persists as `StoredCredentials.insecureHttpAllowed` rather than requiring a `run --insecure` flag (`run` never accepts one, by design — see README § Security).

### I. Supply-chain hygiene gates (AIX-559)

**Dependency advisories.** `aixle_insights_audit` in `.github/workflows/ci.yml`
runs `npm audit --audit-level=high` and `npm audit signatures` over
`packages/tools` on every push, installing with `--ignore-scripts`. It is
deliberately absent from `migrate.needs`: Brakeman analyses our own source and is
deterministic, whereas `npm audit` reads a live upstream feed and can go red with
no change on our side, so gating deploys on it would let a third-party advisory
block an unrelated hotfix.

*Triage when it goes red:* `npm audit fix` from `packages/tools` first. If the
only available fix is semver-major, weigh the upgrade on its merits — do not
reach for `overrides` by reflex. Overrides go in the private, unpublished
`packages/tools/package.json`, so they fix our CI signal and **not** what
consumers install. If upstream has no fix at all, that is a deliberate,
time-boxed exception recorded here — never a lowered `--audit-level`.

**Security linting.** `eslint.config.js` enables `eslint-plugin-security` with
explicit severities; `security.configs.recommended` sets every rule to `warn`,
which `eslint` exits 0 on, so the preset alone is not a gate. Twelve rules are
errors. Two are off by measurement, taken by running the linter over the non-test
tree rather than estimated:
`detect-non-literal-fs-filename` (94 reports across 18 files, 93 distinct lines —
effectively every fs call site; reading local editor data by computed path is the
package's function, and containment is enforced structurally by
`validatedRealPathWithinRoot` / `resolveCursorSqlitePath` in
`src/readers/cursor-sqlite.ts`) and `detect-object-injection` (58 — keyed map
lookups and `argv` scanning). The JS/TS recommended rule sets are deliberately not
enabled; that is a separate change over 16.5k never-linted lines.

AIX-547 adds `src/lib/repo-path-safety.ts`, a second structural containment
layer on the same reasoning. It is not on this branch — reconfirm both counts and
this rationale when that work lands.

ESLint is pinned to the 10.x line, not 9.x. ESLint 9 is now npm's `maintenance`
dist-tag, and its dependency tree pins a `minimatch`/`brace-expansion` chain with
an open high advisory whose only fix is ESLint 10.

**Lifecycle scripts.** Both `ci.yml` and `release-cli.yml` install with
`npm ci --ignore-scripts` and re-allow exactly `better-sqlite3` through
`npm rebuild`, asserting the `.node` artifact afterwards because `npm rebuild`
exits 0 even when a newer npm blocked the script. `keytar`'s binding is absent
under that posture by design — every call site is a guarded `await import`
with a `credentials.json` fallback. The Windows CI lane applies the same posture —
`npm ci --ignore-scripts` followed by a targeted `npm rebuild better-sqlite3` — so
it still exercises the real native compile while no other dependency's install
script runs.

**Why there is no `.npmrc`.** One existed at `packages/tools/aixle-insights/.npmrc`
containing `ignore-scripts=false`, intended to document that the package has no
lifecycle scripts of its own. It was removed in AIX-559 because npm **ignores**
`.npmrc` inside a workspace member — every npm command from that directory printed
`npm warn config ignoring workspace config`, and the setting only applied under
`--no-workspaces`. It also never shipped (not in the `files` allowlist; confirmed
by `npm pack --dry-run`). The guarantee it was meant to provide is enforced
properly by the lifecycle-script allowlist in `release-cli.yml` and by the
explicit `npm run build` before publish.

*The inverse was also evaluated and rejected:* moving `ignore-scripts=true` up to
`packages/tools/.npmrc`, where npm would honour it. That would make every
developer's `npm ci` skip the `better-sqlite3` postinstall and require a manual
`npm rebuild better-sqlite3` before tests would run. CI already has that posture
where it matters; imposing it on local installs trades real daily friction for no
additional protection.

**Node floor.** `engines.node` is duplicated in `package.json`, the lockfile,
`README.md` and `RELEASING.md`. `src/test/supply-chain-contract.test.ts` derives
the value from `package.json` and fails if the others disagree. That test also
asserts no `state-*.json` or `credentials.json` is tracked under the package.

Known hole: our floor `>=20.19.0` admits Node 21.x, but `glob@13`, `minimatch@10`
and `path-scurry@2` declare `18 || 20 || >=22`, and `lru-cache@11` /
`brace-expansion@5` declare `20 || >=22` — none of them accept 21.x. Node 21 was
never an LTS line and is EOL, and `engines` is advisory without
`engine-strict=true`, so this is left as-is rather than narrowing the published
contract. On the dev side `eslint@10` needs `^20.19.0 || ^22.13.0 || >=24`, so
Node 22.0–22.12 can install the package but not run the lint.

**Out of scope, tracked elsewhere:** Dependabot, CodeQL and secret scanning are
[AIX-433](AIX-433)
(public-repo prerequisite). `publishConfig.provenance` stays explicitly `false`,
guarded in `release-cli.yml`, and flips to `true` in the same PR that makes the
repository public.

### J. Automated nightly release architecture (AIX-739)

`.github/workflows/npm-nightly-builds.yml` ("NPM Auto Publish") supports both
channels — stable from `develop` to the `latest` dist-tag, staging from
`staging` to the `staging` dist-tag — publishing at most once per day, and
only when that branch has new package-relevant commits since its last build.

**Only `staging` is on the cron; `stable` is manual-dispatch only.** Measured
during the 2026-08-19 live validation: `develop` trails `staging` by ~163
package-relevant commits (57 files, +2693/-599; shipped `src/` alone 22 files,
+758/-182, including `src/install/cursor.ts`, `src/sync.ts`, `src/server.ts`).
Putting `stable` on the cron would therefore ship a `latest` materially older
than what QA has already validated on `staging` — every day, unattended. The
divergence is a pre-existing branch-topology problem; automating around it
would convert an occasional manual-release hazard into a daily one. Scheduled
runs resolve `CHANNEL_INPUT` to `staging`, so moving the production `latest`
dist-tag stays a deliberate human dispatch. Add `stable` to the cron only once
`develop` genuinely reflects what should reach production.

It deliberately reuses
`release-cli.yml`'s guards unmodified rather than duplicating any of them;
the only change to that file is a `concurrency:` group (defense-in-depth,
since npm's own version immutability already prevents a true double-publish
of the same version string).

- **npm's dist-tag is the source of truth for "what's published," never a
  sorted git tag list.** A real, permanent stray tag exists in this repo —
  `cli-mcp-v9.9.9-rc.1`, from a deliberate guard test that correctly failed
  before publishing, but the tag itself was never deleted (failed runs don't
  clean up their tags). It sorts above every real version and would corrupt
  a "sort tags, take the highest" approach to computing the next version.
  Git tags are used only for an **exact-match lookup**
  (`cli-mcp-v<dist-tag version>`) to anchor the skip-check's commit range.
- **The two channels have independent version counters, not a shared version
  space.** Confirmed against real history: stable stayed at `0.2.1` while
  staging independently incremented `0.2.1-staging` → `0.2.7-staging` six
  times with no corresponding stable movement. The next version for a
  channel is `bump-patch(that channel's own current dist-tag)` only.
- **Version-bump commits are tag-only and never merged into `develop` or
  `staging`.** The workflow commits the `package.json` bump in the checked-
  out working tree, tags that commit, and pushes only the tag — the commit
  is never pushed to the branch ref. This avoids a version-bump merge
  conflict on every future `develop`↔`staging` reconciliation and avoids
  triggering a full `ci.yml` run (README-drift gate, `npm audit`) for a
  one-line bump. Consequence: `package.json` as checked into `develop`/
  `staging` will look "behind" the latest published version — that is
  expected, not drift; the npm dist-tag is the actual source of truth.

  **Second, less obvious consequence — do not "simplify" this away.** Because
  the bump commit is never pushed, every tag this automation creates points at
  a commit that is *off-branch by construction*. So a provenance check of the
  form `git merge-base --is-ancestor <previous tag> HEAD` can never pass once
  the predecessor was created by the automation rather than by a human. That
  is precisely what happened: the assertion held on the first automated run
  (whose predecessor was a human-pushed, on-branch tag) and then failed on
  every run after it — **the automation worked exactly once**, and only a
  second run could reveal it (2026-08-19 cron, issue #548). The check now
  asserts the previous release *point* is in history: the tag itself when it
  is on-branch (human-cut releases), otherwise the tag's **parent**, which is
  the branch commit the release was really built from. It still fails loud on
  genuine nonlinear history — verified including a case that must fail.

  For the same reason, anything else deriving a commit range from a previous
  tag must tolerate an off-branch tag. Two such consumers were checked and are
  correct as written, because an off-branch tag's ancestors are all on-branch:
  the skip-check (`<previous tag>..HEAD`, scoped to the package paths) and the
  release-notes range (`<previous tag>..<new tag>^`).
- **`workflow_dispatch`, not the tag-push trigger, starts the publish.** A
  tag pushed with the default `GITHUB_TOKEN` does not fire
  `release-cli.yml`'s `on: push: tags` — GitHub suppresses workflow runs
  triggered by `GITHUB_TOKEN`-authored events, to prevent recursive
  triggering. Confirmed against a real human-pushed tag's run (`event:
  push`) for contrast, and again on 2026-08-19 when the automation's own tag
  push produced no `push`-triggered run. The dispatch API returns `204 No
  Content`, so no run ID comes back; the dispatched run is found by polling
  `gh run list` filtered to the tag's `headBranch` and a timestamp no earlier
  than the dispatch call, with bounded timeouts — an unmatched or ambiguous
  result fails loud rather than guessing which run to follow. Newer `gh` does
  print a run URL on dispatch, but that is CLI presentation, not an API
  contract, so it is deliberately not parsed: polling cannot be broken by a
  `gh` output-format change, and it is the path proven end-to-end in
  production.
- **Post-publish verification waits for npm; the GitHub Release does not wait
  for verification.** Since 2026-07-28 npm scans every publish for malware
  *before* the package becomes installable — "typically around five minutes …
  up to 15 minutes or more, at peak times or depending on a package's content
  and size", and explicitly not a service guarantee. Our tarball carries a
  native `better-sqlite3` build, i.e. the slow end of that. npm's own guidance
  is the requirement: automation "that assumes a package is installable
  immediately after publishing" must "tolerate a short availability delay".
  Two consequences are encoded in the workflow and must not be simplified
  away:

  1. Verification **polls** (900s budget) rather than asserting once, and every
     registry read passes `--prefer-online`. Both halves are needed for
     different reasons: the server-side scanning window only yields to waiting,
     while `actions/setup-node`'s `cache: "npm"` restores a warm `~/.npm`
     packument that the dispatch step's own `npm view` populates *before* the
     publish — so without forced revalidation a poll loop would re-read one
     cached answer forever. `fetch-retries` does not help; it covers network
     failures and 5xx, not a successful `200` carrying pre-publish data.
  2. **`Create GitHub Release` runs before the smoke test.** While it ran after,
     a single scanning-window flake permanently forfeited the release notes of
     an already-published version: run `32375219884` published
     `0.2.9-staging`, read a stale dist-tag 7 seconds later, failed, and
     skipped the Release. A re-run cannot recover it, because
     `computeNextVersion` derives from the *current* dist-tag, so once that has
     moved the next run computes an unpublished successor and classifies
     `up-to-date`. The publish is irreversible by that point and the Release
     merely documents what shipped, so it must not hang off a later readback.
     The smoke test still fails the run and still opens a failure issue.

  Corollary worth recording so nobody relies on it: the
  `version-published-tag-or-release-incomplete` classification is reachable
  **only when the registry read is itself stale** — that stale read is what
  makes `computedNextVersion` equal the already-published version. Its unit
  test passes because it feeds `classifyPhase` inputs directly; the pure
  function is correct, but the wiring does not produce those inputs under
  consistent reads. It is defence-in-depth, not the recovery path. The
  ordering in (2) is what actually removes the need for recovery.
- **`packages/tools/package-lock.json` is deliberately not touched by this
  automation.** Verified empirically, not assumed: its recorded
  `aixle-insights` workspace version was already stale (`0.2.0`) against the
  real `package.json` (`0.2.1`) before this feature existed, and had been
  through seven successful CI/release runs (`npm ci --ignore-scripts`, both
  `ci.yml` and `release-cli.yml`) regardless. `npm ci` does not enforce
  consistency between the lockfile's recorded workspace-member version and
  that workspace member's own `package.json` in the npm version this repo
  uses. Bumping the lockfile in the tag-only commit would be a change with
  no correctness benefit, on a file this automation otherwise has no reason
  to touch.
- **Automated builds get a GitHub Release (`--generate-notes`), never a
  `CHANGELOG.md` entry.** The existing `CHANGELOG.md` is hand-written prose
  per release — migration notes, breaking-change callouts, the *why*, not
  just the *what* — authored when a human decides a real release is
  happening. That is not reproducible from Conventional Commit subject
  lines, and asking for it on a build that can happen daily and unattended
  would either produce something worse than today's changelog or block the
  automation entirely. Researched, not assumed: `conventional-changelog`,
  `standard-version`, and `semantic-release` — the standard tooling for
  exactly this Conventional-Commits-driven pattern — all write to a separate
  changelog file, never embed one in `README.md`. The previous tag is always
  pinned explicitly to the same channel's exact-match tag; GitHub's
  auto-detected "previous release" is not channel-aware and would otherwise
  diff a stable release against the last staging prerelease or vice versa.
- **Release notes are scoped to the package, not the repository.** Found in
  production on 2026-08-19: `--generate-notes` has no path filter, so in this
  monorepo the `0.2.8-staging` notes listed AIX-627 (web events filter),
  -718 (an api RSpec flake) and -699 (a CLAUDE.md edit) — none of which touch
  the published package. For an npm changelog that is not merely noisy, it is
  misleading about what actually shipped. The body is therefore built from
  `git log <prev>..<new> --no-merges --pretty='- %s' -- packages/tools/aixle-insights`
  and passed via `--notes`, with `--generate-notes` kept only as a fallback if
  that yields nothing. Subjects are deduped with `awk '!seen[$0]++'` rather
  than `sort -u`: the same subject legitimately recurs (a fix cherry-picked to
  `staging` keeps its subject, so both copies appear), and sorting would also
  destroy the newest-first ordering. Measured effect on 0.2.8-staging: 25
  lines → 20, with all three unrelated tickets gone.
- **Failures are never silent, and nothing is auto-rolled-back.** A
  post-publish smoke test (dist-tag check, `--help`, `npm audit signatures`)
  runs on both channels *after* the Release is created — see the
  availability-window decision above for why that ordering is deliberate and
  must not be flipped back. A failure opens a
  deduped GitHub issue (by channel *and* failure phase — a provenance-check
  failure and a smoke-test failure are different problems and must not
  collapse into one masked issue); a smoke-test failure specifically
  includes a pre-filled `npm dist-tag add` rollback command, which is never
  run automatically. `npm unpublish` is never used, matching the existing
  manual-release runbook's stance.

### K. Default-org resolution on `init` is explicit, never silent

Each credential binds exactly one organization (decision B partitions state by host + token, and one org per token). `init` resolves that org when `--organization-id` / `DB90_ORGANIZATION_ID` is omitted:

- **Single-org account** → bind that org automatically (unchanged; zero friction).
- **Multi-org account** → bind the user's server-side **Default Organization** (`default_org_id`) preference from the Aixle Insights API.
- **Multi-org account with no valid preference** → the API returns HTTP 422 with a machine-readable code and the caller's org list; the CLI surfaces `organization_selection_required`, prints the orgs, and exits non-zero **without persisting credentials**. It no longer silently binds the oldest membership.

Because credentials persist only on success, remediation (re-run with `--organization-id`, or set a Default Organization in web Preferences) requires completing the Keycloak device login again. The bound org is surfaced by `health` / `aixle_insights_status` as `organization_id` (decision below and section 7). Note the web app's "current org" is the last-used org kept in browser `localStorage`, not the `default_org_id` preference `init` reads — see the README's Multi-org Preferences caveat. The API and CLI ship together: an older CLI against the new API sees a generic HTTP 422 instead of the org list, so the change must roll out coordinated (AIX-606).

## 5) Build and Test Architecture

### Local build

- Workspace: `packages/tools`.
- Package build command:
  - `npm run build --workspace=@aixle/insights`
- Build steps:
  1. TypeScript compile (`tsc`) from `src` to `dist`.
  2. Explicit copy of `src/hooks/hook-forwarder.mjs` to `dist/hooks/hook-forwarder.mjs`.

### Test strategy

- Test runner: Vitest (`npm test --workspace=@aixle/insights`).
- Coverage focus:
  - CLI argument behavior and init flows,
  - auth exchange and credential storage,
  - readers/mappers and payload contract checks,
  - sync orchestration and retry/backoff logic,
  - hook config/queue behavior and install paths,
  - observability contracts — `src/test/log.test.ts`, plus
    `src/test/lib/parse-failure-logging.test.ts` for decision G, which asserts both directions:
    a present-but-rejected store warns, and an absent one stays silent.

### CI lanes

- Linux build + test for package.
- Windows install/build smoke for native dependency (`better-sqlite3`) path.

## 6) Release Architecture

- Release trigger: tag `cli-mcp-vX.Y.Z` (or guarded manual dispatch).
- Working directory: `packages/tools/aixle-insights`.
- Hard gates include:
  - tag version equals `package.json` version,
  - package source free of legacy/placeholder scope identifiers,
  - no `file:`/`link:` dependencies in publishable sections,
  - only `prepublishOnly` lifecycle script allowed,
  - explicit `publishConfig.provenance: false` while source repo remains private,
  - signed dependency verification + pack allowlist (`dist/**`, `README.md`, `LICENSE`, `package.json`).

Reference runbook: `packages/tools/RELEASING.md`.

## 7) Operational Reference

- App dir default: `~/.aixle-insights` (override `AIXLE_INSIGHTS_HOME`).
- Core files:
  - credentials: keychain first, `credentials.json` as fallback (see decision A and the README)
  - optional config: `config.json`
  - state: `state-<hostname>-<token-hash>.json`
  - lock: `state.lock`
  - logs: `mcp.log` and `mcp.log.1` rotation
  - optional queue: `hooks-queue.ndjson`
- All of credentials, `config.json`, and state are validated on read; a present-but-rejected store
  warns to `mcp.log` and falls back to its default (decision G).
- Health surfaces (both include the bound `organization_id`, decision H):
  - CLI: `aixle-insights health`
  - MCP: `aixle_insights_status`

## 8) Known Trade-offs and Current Direction

### Trade-offs

- Cursor line-based daily stats are estimates, not exact token accounting.
- Multi-model session handling can still involve approximations in cost attribution.
- Legacy Cursor data paths remain for compatibility and may be empty on many installs.

### Direction

1. Keep install path simple (`npx ... init`) while preserving strict security gates.
2. Continue reducing duplicate counting across Cursor paths as transcript coverage expands.
3. Improve attribution fidelity (workspace/project/model) without adding heavy user configuration.
4. Maintain backwards compatibility for existing local state/credential installs where practical.

## 9) Source Map (Quick Navigation)

- CLI entry: `src/cli.ts`
- MCP server/tools: `src/server.ts`
- Sync engine: `src/sync.ts`
- Cursor payload preparation: `src/collect-cursor-payloads.ts`
- Claude reader/mapper: `src/readers/claude.ts`
- Cursor readers/mappers: `src/readers/cursor.ts`
- Cursor SQLite security helper (readonly open + path containment): `src/readers/cursor-sqlite.ts`
- Untrusted repo-path containment (normalize + realpath + root check): `src/lib/repo-path-safety.ts`
- Argv option-injection guards for `git`/`ssh`: `src/lib/spawn-arg-safety.ts`
- HTTPS-or-loopback gate (shared by both TLS gates): `src/lib/transport-security.ts`
- Safe classification of a caught parse/read error (never echoes payload content): `src/lib/parse-error.ts`
- Auth flow: `src/auth/flow.ts`, `src/auth/keycloak.ts`, `src/auth/exchange.ts`
- Credentials: `src/auth/credentials.ts`
- Config loading: `src/lib/config.ts`, `src/cursor-config.ts`
- State/lock/log: `src/state.ts`, `src/lock.ts`, `src/log.ts`
- Installer/hook config: `src/install/claude.ts`, `src/hooks/hooks-config.ts`
- Health model: `src/health.ts`
- Release workflow: `.github/workflows/release-cli.yml`
