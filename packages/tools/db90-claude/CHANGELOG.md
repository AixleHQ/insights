# Changelog

All notable changes to `@db90/claude` will be documented in this file.

## Unreleased

## 0.1.0 — TBD

- First public release on npm as `@db90/claude`.
- On-disk command name remains `db90-claude` to preserve existing scripts and aliases.
- Library entry `@db90/claude/sync` exposes `syncOnce(options: SyncOptions): Promise<SyncResult>` for direct use by `@db90/mcp`. Re-exports `PricingTable`, `ModelPricing`, `DEFAULT_PRICING`, `mergePricing`, `resolveProjectId`, `ProjectResolution`.
- Risk-level scanning per CLI-ingested event (AIX-140). Each session payload now includes `metadata.risk_level` (`low` | `medium` | `high` | `critical`) plus `risk_categories` and `risk_score` derived from a pattern-based scan of transcript content for secrets (AWS keys, GitHub tokens, JWTs) and PII. The dashboard's classification activity consumes these to gate ingestion behaviour. `metadata.scannable: true` distinguishes claude payloads from non-text-bearing payloads (e.g., cursor) where the field is constant.

## API stability policy (applies from 0.1.0 forward)

- Signatures exported from `./sync` are public API.
- Breaking changes to `syncOnce`, `SyncOptions`, or `SyncResult` require a minor-version bump on this package and a coordinated dep bump in `@db90/mcp`.
- Internal modules (`claude-reader`, `client`, `state`) are private. Importing from them is unsupported and may break in patch releases.
