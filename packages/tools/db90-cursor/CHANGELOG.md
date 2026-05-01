# Changelog

All notable changes to `@db90/cursor` will be documented in this file.

## Unreleased

## 0.1.0 — 2026-05-01

- First public release on npm as `@db90/cursor`.
- On-disk command name remains `db90-cursor` to preserve existing scripts and aliases.
- Library entry `@db90/cursor/sync` exposes `syncOnce(options: SyncOptions): Promise<SyncResult>` for direct use by `@db90/mcp`. Re-exports `resolveProjectId`, `ProjectResolution`, `PricingConfig`, `DEFAULT_PRICING`.
- Approximate `cost_usd` calculation per Cursor event (AIX-138). Pricing rates are configurable via the `pricing` block in `~/.db90-cursor/config.json` and threadable through `syncOnce({ ..., pricing })`; defaults are conservative and applied per-field. Each event's `metadata.cost_model` records the rates used so estimates are auditable.
- Cursor payloads now also carry `metadata.scannable: false` and `metadata.risk_level: "none"` constants (AIX-140). Cursor reports line counts rather than text content, so there is nothing for the risk scanner to inspect; the constants exist so the ingest API and dashboard treat cursor and claude events uniformly.

## API stability policy (applies from 0.1.0 forward)

- Signatures exported from `./sync` are public API.
- Breaking changes to `syncOnce`, `SyncOptions`, or `SyncResult` require a minor-version bump on this package and a coordinated dep bump in `@db90/mcp`.
- Internal modules (`cursor-reader`, `mapper`, `client`, `state`) are private. Importing from them is unsupported and may break in patch releases.
