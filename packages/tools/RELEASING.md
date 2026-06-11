# Releasing `@aixle/insights`

Runbook for cutting a public npm release of **`@aixle/insights`**. The package lives at `packages/tools/aixle-insights/` and publishes via `.github/workflows/release-cli.yml`.

## Prerequisites (once per maintainer)

- Member of the `@aixle` npm org with hardware 2FA enabled (FIDO2/WebAuthn — passkey or YubiKey).
- Commit access to this repo.
- **No long-lived npm token required.** Publishing uses OIDC Trusted Publishing (GitHub Actions OIDC). The `npm-publish` GitHub Environment must be configured with the intended reviewer(s).
- `gh` CLI authenticated (`gh auth status` succeeds) for tag pushes via the terminal (optional if you use the GitHub UI).

**Break-glass only** (if OIDC ever fails at npm Inc.'s side): create a short-lived Granular Access Token (90-day max) scoped to `@aixle/insights`, set as `NPM_TOKEN` in GitHub Secrets, then delete it immediately after the publish completes. Never store permanently.

## Tag → release mapping

| Tag pattern | Published package | Working directory |
|-------------|-------------------|-------------------|
| `cli-mcp-vX.Y.Z` | `@aixle/insights` | `packages/tools/aixle-insights` |

> Tag prefix is kept as `cli-mcp-v*` for continuity with the existing CI lane. A future PR may rename the taxonomy to `aixle-insights-v*`.

## Release flow (happy path)

For a release of `@aixle/insights@X.Y.Z`:

1. **Branch and bump.** From `develop`, branch and edit `packages/tools/aixle-insights/package.json`:
   ```bash
   vim packages/tools/aixle-insights/package.json   # set "version": "X.Y.Z"
   ```
2. **Update the changelog** (`packages/tools/aixle-insights/CHANGELOG.md`): add a `## X.Y.Z` section with the dated release notes.
3. **Verify locally** from `packages/tools/`:
   ```bash
   cd packages/tools
   npm ci
   npm run build --workspace=@aixle/insights
   npm test --workspace=@aixle/insights
   # Pack sanity:
   cd aixle-insights
   npm pack --dry-run
   # Expect: dist/**, README.md, LICENSE, package.json
   ```
4. **Commit + PR** (message example):
   ```
   [AIX-<ticket>] Release @aixle/insights X.Y.Z
   ```
   Land via review onto `develop`.
5. **Tag once merged**:
   ```bash
   git checkout develop && git pull
   git tag cli-mcp-vX.Y.Z
   git push origin cli-mcp-vX.Y.Z
   ```
6. **Watch the workflow** (`.github/workflows/release-cli.yml` — "Release CLI to npm"). It:
   - Pauses on the `npm-publish` GitHub Environment gate — a configured reviewer must approve before publish runs.
   - Matches tag version against `package.json` (and the `version` workflow_dispatch input).
   - Rejects placeholder + legacy scope literals (`@<scope>`, `@db90/telemetry-mcp`, `db90-telemetry-mcp`, `db90-mcp`) anywhere in the package source — straggler trap.
   - Rejects `file:` / `link:` dependency specs that cannot ship to the registry.
   - Rejects any lifecycle script in `package.json` other than `prepublishOnly`.
   - Asserts `publishConfig.provenance` is `true`.
   - Runs `npm ci --ignore-scripts` (defends against compromised-dep postinstall payloads).
   - Runs `npm audit signatures` over the installed dep tree (verifies registry-signed integrity).
   - Builds, tests.
   - `npm pack --dry-run --json` against an allowlist: `dist/**`, `README.md`, `LICENSE`, `package.json`.
   - `npm publish` via OIDC Trusted Publishing — short-lived token minted by GitHub OIDC; no secret read. Provenance attestation is automatic.
7. **Smoke-test the published artifact** from an empty directory (outside the monorepo):
   ```bash
   npm view @aixle/insights version            # confirms registry has the new version
   npx -y @aixle/insights@X.Y.Z --help

   # Verify cryptographic provenance:
   npm audit signatures @aixle/insights@X.Y.Z
   # Expected: Signed artifact, provenance verified
   ```
   **Clean-profile init smoke** (a disposable user account or a machine with no prior install):
   1. `npx -y @aixle/insights@X.Y.Z init --host … --keycloak-url … --organization-id <uuid>`
   2. Complete Keycloak device authorization in the browser.
   3. Open `~/.claude.json` → confirm `mcpServers.aixle-insights` references `npx -y @aixle/insights run`.
   4. Restart Claude Code. Invoke the `db90_status` MCP tool inside a session, or run `aixle-insights health` from the shell.
   5. Trigger `aixle-insights run --once` and check the API's `/events` for the resulting payload.

   **Time budget:** the scripted steps above should finish in ≤ 5 minutes on typical broadband, excluding SSO credential hunting.

   If something fails post-publish, ship a patch (`X.Y.Z+1`). Avoid `npm unpublish` — npm restricts it; forward fixes are easier.
8. **GitHub Release (optional)**:
   ```bash
   gh release create cli-mcp-vX.Y.Z \
     --title "@aixle/insights X.Y.Z" \
     --notes-file packages/tools/aixle-insights/CHANGELOG.md
   ```

## Manual publish (`workflow_dispatch`)

When a tag is not viable:

1. Ensure `package.json` on the publishing branch carries the intended version string.
2. Actions → **Release CLI to npm** → **Run workflow** → choose package `mcp` and enter `version` (must equal `package.json` exactly — no leading `v`).
3. Guards are identical to tag pushes; no bypass paths.

Record the Actions run URL, outcome, `npm view` output, smoke-test result, elapsed time, and any Keycloak quirks in your PR description or completion notes.

## If something goes wrong

- **"Verify version matches package.json"** — tag (`cli-mcp-v…`) or `version` input mismatch; bump in a new commit and re-tag.
- **Obsolete-scope guard** — a legacy `@db90/telemetry-mcp` / `db90-mcp` / `db90-telemetry-mcp` / `@<scope>` literal slipped into the package. Find and replace, then re-tag.
- **Unauthorized lifecycle script guard** — only `prepublishOnly` is allowed. If a new lifecycle script is genuinely required, update the guard *and* `plans/npm-org-setup-aixle/tasks/03-package-and-workflow-hardening.md` together.
- **`publishConfig.provenance` guard** — `package.json` must keep `"publishConfig": { "access": "public", "provenance": true }`. Do not remove the `provenance` flag.
- **`npm audit signatures` failure** — a dep was unpublished + republished with a different signing identity, or registry signature drift. Investigate the failing dep on `npmjs.com` before disabling the check.
- **Pack allowlist leaks** — fix `files` field / `.npmignore`; ensure stray artifacts are not staged.
- **403 from npm (OIDC failure)** — check, in order:
  1. Trusted Publisher config on `npmjs.com/package/@aixle/insights` matches: GitHub org `dualboot-partners`, repo `db90-rails`, workflow `release-cli.yml`, environment `npm-publish` (all case-sensitive).
  2. The workflow has `permissions: id-token: write` at the top level — already set in `.github/workflows/release-cli.yml`.
  3. The publish job runs inside the `npm-publish` GitHub Environment (check workflow logs for the "Environment: npm-publish" line).
  4. npm CLI is ≥ 11.5.1 (the workflow upgrades npm with `npm install -g npm@latest` before publish; confirm that step ran green).
  5. **Last resort only:** see "Break-glass only" under Prerequisites — create a short-lived Granular Access Token, set as `NPM_TOKEN`, delete after the run. Not a permanent fix.

## Evidence checklist

Before marking a release ticket done:

1. Tag pushed (`cli-mcp-v…`).
2. GitHub Actions URL + green conclusion.
3. `npm view @aixle/insights version` output matches the tag.
4. Clean-profile `npx -y @aixle/insights init` narrative (issuer used, Claude config snippet, `db90_status` / health excerpt).
5. Approximate elapsed time (≤ 5 min guideline).
