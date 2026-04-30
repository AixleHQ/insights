# Releasing the db90 CLIs

Runbook for cutting a new release of `@db90/claude` or `@db90/cursor` to public npm. Each package versions independently.

> MCP (`@db90/mcp`) is currently excluded — see the note at the bottom.

## Prerequisites (once per maintainer)

- Member of the `@db90` npm org with hardware 2FA enabled.
- Commit access to this repo.
- Repo secret `NPM_TOKEN` exists and is not expired. See `CLAUDE.md` → "Release secrets" for rotation policy.
- `gh` CLI authenticated (`gh auth status` succeeds) for tag pushes via the terminal, optional if you prefer the GitHub UI.

## Release flow (happy path)

For a release of package `<pkg>` (`claude` or `cursor`) at version `X.Y.Z`:

1. **Branch and bump.** On a feature branch cut from `develop`:
   ```
   cd packages/tools/db90-<pkg>
   # edit package.json: "version": "X.Y.Z"
   ```
2. **Update the changelog.** Same directory:
   ```
   # edit CHANGELOG.md:
   #   - Replace "## X.Y.Z — TBD" with "## X.Y.Z — YYYY-MM-DD"
   #   - Move anything under "## Unreleased" into the new version section
   ```
3. **Verify locally.** From the workspace root:
   ```
   cd packages/tools
   npm ci
   npm run build --workspace=@db90/sdk
   npm run build --workspace=@db90/<pkg>
   npm test --workspace=@db90/<pkg>
   cd db90-<pkg>
   npm pack --dry-run
   # review the file list — should only contain dist/**, node_modules/@db90/sdk/**, README.md, LICENSE, package.json
   ```
4. **Commit and open a PR.** Commit message:
   ```
   [AIX-<ticket>] Release @db90/<pkg> X.Y.Z
   ```
   Land via the normal review/CI flow on `develop`.
5. **Tag once merged.** After the PR merges to `develop`:
   ```
   git checkout develop
   git pull
   git tag cli-<pkg>-vX.Y.Z
   git push origin cli-<pkg>-vX.Y.Z
   ```
6. **Watch the workflow.** [`release-cli.yml`](../../.github/workflows/release-cli.yml) runs:
   - Verifies tag version matches `package.json` version (fails otherwise).
   - Rejects placeholder scopes and `file:`/`link:` dependencies.
   - Installs the workspace, builds the SDK, builds and tests the target connector.
   - Runs `npm pack --dry-run` and verifies the tarball contains only the allowlisted paths and includes the bundled SDK (`node_modules/@db90/sdk/dist/**`).
   - Runs `npm publish` with `NODE_AUTH_TOKEN` from `NPM_TOKEN`.
7. **Smoke-test the published package.** From a temp directory (not the monorepo):
   ```
   npx -y @db90/<pkg> --help
   npx -y @db90/<pkg> --token test --host https://example.com --dry-run
   ```
   If either fails, re-publish a patch version with the fix rather than unpublishing.
8. **Create the GitHub release.** Optional but recommended:
   ```
   gh release create cli-<pkg>-vX.Y.Z \
     --title "@db90/<pkg> X.Y.Z" \
     --notes-file packages/tools/db90-<pkg>/CHANGELOG.md
   ```

## Manual publish (dispatch)

If a tag push can't be used (e.g. hotfix from a non-default branch), use the `workflow_dispatch` path:

1. Ensure `package.json` version on the branch you want to publish is correct.
2. Trigger [`release-cli.yml`](../../.github/workflows/release-cli.yml) → "Run workflow" → select `package` and enter `version` (must match `package.json` exactly; no leading `v`).
3. Manual runs still go through all guards, including the version-match check.

## If something goes wrong

- **Workflow fails at "Verify version matches package.json"** — tag or dispatch input does not match `package.json`. Don't force-push; bump the version in a new commit and re-tag.
- **Workflow fails at "Verify pack contents"** — something leaked outside the `files` allowlist. Check `packages/tools/db90-<pkg>/package.json` `files` field and the `.gitignore`/`npmignore`.
- **Workflow fails at "BLOCKER: tarball is missing node_modules/@db90/sdk/dist/**"** — `prepack` did not stage the SDK. Rebuild SDK first (`npm run build --workspace=@db90/sdk`) or investigate [`scripts/stage-sdk-bundle.mjs`](scripts/stage-sdk-bundle.mjs).
- **`npm publish` fails with 403** — `NPM_TOKEN` is expired or no longer has write access on `@db90/*`. See `CLAUDE.md` → "Release secrets" and regenerate.
- **Accidentally published a broken build** — publish a patch version with the fix. Do not `npm unpublish` — that shifts semver promises and breaks any consumer who already installed.

## Independent versioning policy

- Each CLI versions on its own axis. `@db90/claude@0.2.0` does not imply anything about `@db90/cursor` or vice versa.
- Tag prefixes (`cli-claude-v*`, `cli-cursor-v*`) route to the correct package; a tag with the wrong prefix won't publish the wrong package.
- Keep `CHANGELOG.md` dates, package.json versions, and tag numbers identical for a given release.

## MCP exclusion

`@db90/mcp` is intentionally not covered by this runbook. `src/sync.ts` currently ships scaffold stubs (`runClaudeSync` and `runCursorSync` return zero counts). The `cli-mcp-v*` tag prefix has been removed from [`release-cli.yml`](../../.github/workflows/release-cli.yml) until [Task 10](../../plans/npm-distribution-AIX-157/tasks/10-mcp-publish.md) lands the real sync wiring. Re-enable the tag prefix in the same PR that lands Task 10.
