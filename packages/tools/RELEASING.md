# Releasing `@db90/*` CLI packages

This runbook covers `@db90/claude` and `@db90/cursor`. MCP (`@db90/mcp`) follows the same steps once Track A is live — a separate `cli-mcp-v*` tag will be enabled in `release-cli.yml` at that point.

## Prerequisites

- `@db90` npm org exists and you are a member with publish access.
- `NPM_TOKEN` (automation token, scoped `@db90/*`, read + write) is set as a GitHub Actions repository secret.
- You are on an up-to-date `develop` branch with both PR A and PR B merged.
- `git status` is clean.

## 1. Verify locally

```bash
cd packages/tools
npm ci
npm run build --workspace=@db90/sdk
npm run build --workspace=@db90/claude && npm test --workspace=@db90/claude
npm run build --workspace=@db90/cursor && npm test --workspace=@db90/cursor
```

## 2. Pack dry-run

```bash
cd db90-claude && npm pack --dry-run
cd ../db90-cursor && npm pack --dry-run
```

Expected for each tarball: `dist/**`, `node_modules/@db90/sdk/dist/**` (bundled), `README.md`, `LICENSE`, `package.json`. Nothing else. If `@db90/sdk/dist/` is missing, run `npm run build --workspace=@db90/sdk` first.

## 3. Confirm CHANGELOG and version

- `packages/tools/db90-claude/CHANGELOG.md` — top version entry must match `package.json` version and have a real date (not "TBD").
- Same for `db90-cursor`.

## 4. Push tags

```bash
git checkout develop && git pull
git tag cli-claude-vX.Y.Z
git tag cli-cursor-vX.Y.Z
git push origin cli-claude-vX.Y.Z cli-cursor-vX.Y.Z
```

`release-cli.yml` triggers on each tag and publishes independently. Claude and Cursor do not need to release together.

## 5. Watch the workflow

GitHub → Actions → filter by the tag. Each job:
1. Resolves the package from the tag name.
2. Checks `package.json` version matches the tag (aborts if not).
3. Rejects stale `@<scope>` or `@aixle/` scope names.
4. Builds SDK → builds package → runs tests.
5. Verifies tarball contents (SDK must be bundled).
6. `npm publish`.

## 6. Smoke test post-publish

From a directory **outside the monorepo**:

```bash
mkdir /tmp/db90-smoke && cd /tmp/db90-smoke
npx -y @db90/claude@X.Y.Z --help
npx -y @db90/cursor@X.Y.Z --help
```

Follow the README verbatim with a staging ingest token to confirm end-to-end ingest.

## 7. Create GitHub Releases

```bash
gh release create cli-claude-vX.Y.Z \
  --title "@db90/claude X.Y.Z" \
  --notes-file packages/tools/db90-claude/CHANGELOG.md

gh release create cli-cursor-vX.Y.Z \
  --title "@db90/cursor X.Y.Z" \
  --notes-file packages/tools/db90-cursor/CHANGELOG.md
```

## Fix-forward policy

- **Do not `npm unpublish`** — it breaks anyone who already installed.
- If a publish has a bug: bump the patch version, update CHANGELOG, push a new tag.
- Minimum patch bump: `X.Y.Z` → `X.Y.(Z+1)`.

## NPM_TOKEN rotation

Set a calendar reminder 11 months after token creation. Generate a new automation token in the npm org, update the GitHub secret, and delete the old token. Owner: Ada Lovelace or Grace Hopper.
