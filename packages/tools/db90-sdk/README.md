# @db90/sdk

Internal SDK shared by [`@db90/claude`](../db90-claude) and [`@db90/cursor`](../db90-cursor).

> **Private — not published to npm.** `"private": true` in [`package.json`](./package.json) guards against accidental publish. Consumed as a workspace dependency (`"@db90/sdk": "*"`) and bundled into each connector's tarball via the `prepack` staging script.

## What lives here

- Project resolution and git-remote detection ([`src/project-resolver.ts`](src/project-resolver.ts)): looks up the project UUID for a connector run, given a git remote. Shared between Claude Code and Cursor because the detection logic is identical.
- HTTP ingest primitive (`postEvent`) and shared config envelope — landed as part of [AIX-141](AIX-141) to remove duplication between the two connectors.

See [`src/index.ts`](src/index.ts) for the current public surface.

## Bundling strategy

Each connector declares `"bundledDependencies": ["@db90/sdk"]` and runs [`../scripts/stage-sdk-bundle.mjs`](../scripts/stage-sdk-bundle.mjs) from `prepack`. The script copies the built SDK (`dist/` + `package.json`) into `node_modules/@db90/sdk` of the connector so that `npm pack` physically bundles it. Without this step, the tarball would ship an unresolvable `@db90/sdk@*` registry dependency (the SDK is private) and every `npm install @db90/claude` or `npm install @db90/cursor` would fail.

The release workflow ([`/.github/workflows/release-cli.yml`](../../.github/workflows/release-cli.yml)) verifies the bundled SDK is present in every tarball before publishing, fail-closed.

## Contributing

- Keep the SDK free of connector-specific data sources (no `claude-reader`, no `cursor-reader`, no `better-sqlite3`).
- Any shared module added here must have tests in [`src/test/`](src/test/), not duplicated in the connector packages.
- After any change, rebuild with `npm run build --workspace=@db90/sdk` (from `packages/tools`) and verify the bundled copy is up to date by running `npm pack --dry-run` in a connector directory.

## License

MIT — inherits from the monorepo root [`LICENSE`](../../../LICENSE).
