# NOTICES

Aixle Insights is released under the [Apache License 2.0](LICENSE). This file
discloses licensing considerations for third-party components and services that
the project builds on. It is informational; the Apache-2.0 license governs the
Aixle Insights source code itself.

> **Scope.** This is a **source-only** release. It does not distribute
> pre-built binaries or bundled Docker images of the third-party components
> below. Some notices become relevant only if you choose to redistribute a
> bundled artifact (see § 7).

---

## 1. Redis — pinned to 7.2 (BSD-3-Clause)

Redis **7.2 and earlier** is licensed under the permissive **BSD-3-Clause**
license. Starting with **7.4**, Redis is dual-licensed under **RSALv2 / SSPLv1**,
which are *source-available*, not open source.

To keep the stack unambiguously permissive, the Redis image is pinned to a 7.2
line rather than a floating major tag:

- `docker-compose.yml` → `redis:7.2-alpine`
- `.github/workflows/ci.yml` → `redis:7.2` (CI service container)

If you re-pin to 7.4+, be aware you are opting into RSALv2/SSPLv1 terms. A
drop-in BSD-licensed alternative is [Valkey](https://valkey.io/).

## 2. TimescaleDB — TSL features are load-bearing (Timescale License)

The default database image is `timescale/timescaledb:latest-pg17`. Several
features Aixle Insights depends on are part of the **Timescale License (TSL)**
community edition, **not** the Apache-2.0 licensed core:

- `create_continuous_aggregate` — continuous aggregates (×6)
- `add_retention_policy` — automated data retention (×5)
- `add_compression_policy` — columnar compression (×1)

Relevant migrations:

- `packages/api/db/migrate/20260125224628_create_continuous_aggregates.rb`
- `packages/api/db/migrate/20260706000001_backfill_continuous_aggregates.rb`
- `packages/api/db/migrate/20260125224625_create_tool_events.rb`
- `packages/api/db/migrate/20260513161604_update_tool_events_retention_policy.rb`

**Consequence:** Aixle Insights **cannot run on an Apache-2.0-only TimescaleDB
build** — the TSL features above are required. The TSL permits self-hosting and
internal use at no cost, so this is a **disclosure**, not a blocker. Just note
that "the whole stack is permissive" would be inaccurate: the database layer
relies on TSL-licensed functionality.

See the [Timescale License](https://github.com/timescale/timescaledb/blob/main/tsl/LICENSE-TIMESCALE)
for the exact terms.

## 7. Sidekiq — LGPL-3.0 (runtime dependency)

Aixle Insights uses **Sidekiq 8.1.0**, which is licensed under **LGPL-3.0**
(Sidekiq relicensed away from MIT starting at 7.0).

Our usage is standard: Sidekiq is an **unmodified**, dynamically-loaded gem used
through its public API. Under the LGPL, this does not impose copyleft on the
Aixle Insights application code.

**When this matters:** if you **redistribute a bundled Docker image** (or any
artifact that embeds Sidekiq), you are distributing Sidekiq itself and must
comply with LGPL-3.0 — ship the LGPL-3.0/GPL-3.0 license texts (or a written
offer) alongside the image. For a **source-only** release, no additional action
is required.

---

*Section numbers above follow the internal license-audit numbering and are not
contiguous by design.*
