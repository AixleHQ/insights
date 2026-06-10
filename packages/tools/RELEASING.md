# Releasing the db90 CLIs and MCP

Runbook for cutting a public npm release of **`@db90/claude`**, **`@db90/cursor`**, or **`@db90/telemetry-mcp`**. Each package versions independently under `packages/tools/`.

## Prerequisites (once per maintainer)

- Member of the `@db90` npm org with hardware 2FA enabled.
- Commit access to this repo.
- Repo secret `NPM_TOKEN` exists and is not expired. See `CLAUDE.md` → "Release secrets" for rotation policy.
- `gh` CLI authenticated (`gh auth status` succeeds) for tag pushes via the terminal (optional if you use the GitHub UI).

## Tag prefixes → packages

| Tag pattern | Published package | Working directory |
|-------------|-------------------|-------------------|
| `cli-claude-vX.Y.Z` | `@db90/claude` | `packages/tools/db90-claude` |
| `cli-cursor-vX.Y.Z` | `@db90/cursor` | `packages/tools/db90-cursor` |
| `cli-mcp-vX.Y.Z` | `@db90/telemetry-mcp` | `packages/tools/aixle-insights` |

**Exception:** MCP lives under `aixle-insights/` (not `db90-mcp/`) — the workflow maps `package=mcp` to that folder.

## Release flow (happy path)

For a release of `<pkg>` in `{ claude | cursor | mcp }` at version `X.Y.Z`:

1. **Branch and bump.** On a branch from `develop`, edit `packages/tools/db90-<canonical>/package.json` (for **`mcp`**, the directory is **`aixle-insights`**, not **`db90-mcp`**):
   ```bash
   # examples:
   vim packages/tools/db90-claude/package.json
   vim packages/tools/aixle-insights/package.json
   # set "version": "X.Y.Z"
   ```
2. **Update the changelog** in that same package directory (`CHANGELOG.md`):
   - Move anything under **`## Unreleased`** into a dated **`## X.Y.Z`** (or **`## [X.Y.Z]`**) section when applicable.
   - Keep dates and npm version aligned.
3. **Verify locally.** From `packages/tools`:
   ```bash
   cd packages/tools
   npm ci
   npm run build --workspace=@db90/sdk
   npm run build --workspace=@db90/claude       # substitute target workspace
   npm test --workspace=@db90/claude
   ```
   For MCP:
   ```bash
   npm run build --workspace=@db90/telemetry-mcp
   npm test --workspace=@db90/telemetry-mcp
   ```
   **Pack sanity (all three packages):**
   ```bash
   cd packages/tools/db90-<canonical>   # or aixle-insights for mcp
   npm pack --dry-run
   # Expect: dist/**, node_modules/@db90/sdk/** (bundled SDK), README.md, LICENSE, package.json
   ```
4. **Commit and open a PR** (message example):
   ```
   [AIX-<ticket>] Release @db90/<npm-name> X.Y.Z
   ```
   Land via normal review onto `develop`.
5. **Tag once merged:**
   ```bash
   git checkout develop && git pull
   git tag cli-<pkg>-vX.Y.Z    # pkg is claude | cursor | mcp
   git push origin cli-<pkg>-vX.Y.Z
   ```
6. **Watch the workflow** [`.github/workflows/release-cli.yml`](../../.github/workflows/release-cli.yml) (“Release CLI to npm”). It:
   - Matches tag version ↔ `package.json` (and manual dispatch **`version`** input).
   - Rejects stale placeholder scopes (`@<scope>`, `@aixle/`).
   - Rejects `file:` / `link:` dependency specs that cannot ship on npm.
   - Runs **`npm ci`**, builds **SDK**, then **connector/MCP**.
   - **`npm pack --dry-run --json`** with an allowlist: **`dist/**`**, **`node_modules/@db90/sdk/dist/**`**, **`README.md`**, **`LICENSE`**, **`package.json`**.
   - Fails closed if **`node_modules/@db90/sdk/dist/**`** is missing (private `@db90/sdk`).
   - **`npm publish`** with `NODE_AUTH_TOKEN` from **`NPM_TOKEN`**.
7. **Smoke-test the published artefact.**

   **CLI (`claude` / `cursor`):** from an empty directory (outside the monorepo):
   ```bash
   npx -y @db90/claude --help
   npx -y @db90/claude --token test --host https://example.com --dry-run
   ```
   **`mcp`** — registry check plus clean-profile init (below).

   ```bash
   npm view @db90/telemetry-mcp version
   ```

   **Clean-machine / clean-profile MCP smoke (target 0.1.0 or the version just published):**

   Use a disposable user profile or a machine **without** prior DB90 MCP config.

   1. **`npx -y @db90/telemetry-mcp@X.Y.Z init`**
      - Complete Keycloak **device authorization** in the browser.
      - Confirm success message references **`Restart Claude Code`** where applicable.
   2. Open **`~/.claude.json`** and confirm **`mcpServers.db90`** references `npx -y @db90/telemetry-mcp run` (or equivalent).
   3. Restart Claude Code if needed.
   4. In Claude Code MCP tools, invoke **`db90_status`**; in a shell run **`db90-mcp health`** for the expanded operator view.
   5. **Time budget:** excluding hunting for SSO credentials/org permissions already provisioned by your admin, the scripted steps above should finish **≤ 5 minutes** on typical broadband.

   If something fails post-publish, ship a **patch** version (`X.Y.Z+1`). Do **`npm unpublish`** only under npm policy — prefer forward fixes.

8. **GitHub Release (optional)**:
   ```bash
   gh release create cli-<pkg>-vX.Y.Z \
     --title "@db90/<npm-name> X.Y.Z" \
     --notes-file packages/tools/<dir>/CHANGELOG.md
   ```

## Manual publish (`workflow_dispatch`)

When a tag is not viable:

1. Ensure `package.json` on the publishing branch carries the intended version string.
2. Actions → **Release CLI to npm** → **Run workflow** → choose **`package`** (`claude` | `cursor` | **`mcp`**) and enter **`version`** (must equal `package.json` exactly — **no** leading `v`).
3. Guards are identical to tag pushes — no bypass paths.

Record the Actions run URL, outcome, **`npm view`**, smoke-test result, elapsed wall-clock, and any issuer / Keycloak quirks in your PR description or linked story completion notes.

## If something goes wrong

- **“Verify version matches package.json”** — tag (`cli-*-v`) or **`version`** input mismatch; bump in a **new commit** and re-tag.
- **Pack allowlist leaks** — fix `files` / `.npmignore`; ensure stray artifacts are not staged.
- **“BLOCKER: tarball is missing … @db90/sdk/dist”** — `prepack` did not bundle the SDK (`../scripts/stage-sdk-bundle.mjs`). Build SDK first, ensure **`bundledDependencies`** includes **`@db90/sdk`**, re-run **`npm ci`** locally to verify.
- **403 from npm** — regenerate `NPM_TOKEN` per `CLAUDE.md`.

## Independent versioning policy

Packages move on **separate semver axes**. `@db90/claude@0.2.0` implies nothing about `@db90/cursor` or `@db90/telemetry-mcp`.

## Evidence checklist (MCP `@db90/telemetry-mcp`)

Before marking a DB90 MCP release ticket done, capture:

1. **`git tag`** name pushed (`cli-mcp-v…`).
2. **GitHub Actions** URL + green/failed conclusion.
3. **`npm view @db90/telemetry-mcp version`** output matching the tagged release.
4. **Clean-machine / clean-profile `npx -y … init`** narrative (device login issuer used, Claude config snippet OK, **`db90_status` / health** excerpt).
5. Approximate elapsed time for scripted steps (**≤ 5 min** guideline under normal network).
