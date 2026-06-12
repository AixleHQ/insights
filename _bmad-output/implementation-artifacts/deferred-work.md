# Deferred work (implementation artifacts)

## Deferred from: code review of aix-261-metadata-enrichment.md (2026-06-12)

- **Dedupe re-send wholesale-replaces `metadata` — blast radius now includes `jira_ticket`/`pr_*` stamps** (`packages/api/app/services/tool_events/upsert.rb:126`) — same pre-existing `MUTABLE_FIELDS` issue recorded below for AIX-260; AIX-261 adds more server-stamped keys that a session re-send would wipe. Mitigating fact: commit events carry no `session_id` (verified in `cursor-payload-contract.ts`), so they always take the direct-create branch today. Fix remains merge-not-replace on the dedupe-update path.

## Deferred from: code review of aix-260-normalize-event-type-activity.md (2026-06-12)

- **Same-session re-send wholesale-replaces `metadata`, wiping `renormalized_*`/`source` provenance** (`packages/api/app/services/tool_events/upsert.rb:126,135-137`) — pre-existing `MUTABLE_FIELDS` semantics: dedupe-update replaces the whole metadata blob, so a re-send without the original hint erases renormalization provenance (also affects `cost_source`). Fix is merge-not-replace on the update path — a separate, pre-existing-behavior change outside AIX-260 scope.

## Deferred from: code review of aix-245-backfill-project-attribution.md (2026-05-22)

- **Bulk `update_all` without callbacks/validations** — intentional trade-off for `timeseries.tool_events`; not a blocker for AIX-245.
- **Timescale compressed chunks** — operational runbook (decompression if needed); out of scope for current code.
- **Partial run recovery on interruption** — re-run is idempotent by condition `project_id IS NULL`; separate checkpoint not required by spec.
- **Cost of `dry_run` (many COUNTs)** — acceptable price for predictability without writes; optimize if needed later.
