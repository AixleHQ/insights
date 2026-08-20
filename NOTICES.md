# NOTICES

Aixle Insights is released under the [Apache License 2.0](LICENSE). This file
states the **licensing positions** that need stating: the components whose
licenses shape how you may run, modify, or redistribute the stack, and what we
conclude about each. It is informational; the Apache-2.0 license governs the
Aixle Insights source code itself.

For the complete dependency-by-dependency inventory — every gem and npm package
with its version and license — see
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md). The Apache-2.0 attribution
notice for the project itself is in [NOTICE](NOTICE).

> **Scope.** This is a **source-only** release, with one exception: the
> `@aixle/insights` CLI is published to npm. The project does not distribute
> pre-built binaries or bundled Docker images of the components below. Several
> notices become relevant only if *you* choose to redistribute a bundled
> artifact.

**Summary of positions**

| § | Component | License | Position |
| --- | --- | --- | --- |
| [1](#1-redis--pinned-to-72-bsd-3-clause) | Redis | BSD-3-Clause at 7.2; RSALv2/SSPLv1 from 7.4 | Pinned to 7.2 — the pin is load-bearing |
| [2](#2-timescaledb--tsl-features-are-load-bearing-timescale-license) | TimescaleDB | Timescale License (TSL) for the features we use | Required; cannot run on the Apache-2.0-only build |
| [3](#3-minio--agpl-30-development-stack-only) | MinIO | AGPL-3.0 | Unmodified network service in the dev stack only |
| [4](#4-lightningcss--mpl-20-build-time-only) | lightningcss | MPL-2.0 | Build-time only; not in any shipped artifact |
| [5](#5-non-osi-development-tooling-brakeman-vcr) | Brakeman, VCR | Non-OSI (Brakeman PUL, Hippocratic-2.1) | Dev/test tooling; never distributed |
| [6](#6-gpl-licensed-development-tooling-bundler-audit-diff-lcs) | bundler-audit, diff-lcs | GPL-3.0-or-later; triple-licensed | Dev/test tooling; separate process or MIT option |
| [7](#7-sidekiq--lgpl-30-runtime-dependency) | Sidekiq | LGPL-3.0 | Runtime; obligations attach only on bundled redistribution |
| [8](#8-third-party-trademarks-and-logos-in-the-web-app) | Vendor logos | Trademarks of their owners | Nominative use; not covered by our Apache-2.0 grant |

No component in any runtime dependency graph is under AGPL, GPL, or a
source-available license. The gem tree (167 gems) and the npm trees (1,227
packages across the web app and the CLI workspace) have both been swept in full;
see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for the underlying data.

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

## 3. MinIO — AGPL-3.0, development stack only

`docker-compose.yml` starts `minio/minio:latest` as S3-compatible object storage
for local development. MinIO's server is licensed under **AGPL-3.0**, the
strongest copyleft in this list.

**Position:** MinIO runs as a **separate, unmodified network service** that
Aixle Insights talks to over the S3 HTTP API. It is not linked into, vendored
in, or redistributed by this project, and the AGPL's § 13 network-source
condition attaches to whoever conveys or operates a *modified* MinIO — not to
applications that use its API. Deployments typically point at Amazon S3
(via `aws-sdk-s3`) instead.

**When this matters:** if you modify MinIO and offer it over a network, you owe
your users the modified MinIO source. Nothing about that reaches Aixle Insights'
own code.

## 4. lightningcss — MPL-2.0, build-time only

`lightningcss` and its eleven platform-specific binaries (1.32.0) are licensed
under **MPL-2.0**, a file-level copyleft. They arrive transitively through Vite
in both `packages/web` and the `packages/tools` workspace, and both lockfiles
mark them as development dependencies.

**Position:** lightningcss transforms CSS **at build time**. Its code is not part
of the browser bundle, and not part of the published `@aixle/insights` package.
It is used unmodified, so the MPL's source-disclosure obligation — which applies
per-file, to files you change — is not triggered. Attribution only.

## 5. Non-OSI development tooling (Brakeman, VCR)

Two development dependencies carry licenses that are not OSI-approved:

| Gem | License | Group | Use |
| --- | --- | --- | --- |
| `brakeman` | Brakeman Public Use License | `:development, :test` | Static security analysis in CI |
| `vcr` | Hippocratic-2.1 (offered alongside MIT) | `:test` | Records and replays HTTP fixtures in specs |

**Position:** both are tools we *run*, not code we ship. Neither is linked into
the application or included in any distributed artifact, so their terms bind our
own use in CI and nothing downstream. The Brakeman Public Use License is free for
this use; redistributing Brakeman itself commercially would require a separate
license from its author.

## 6. GPL-licensed development tooling (bundler-audit, diff-lcs)

| Gem | License | Group | Use |
| --- | --- | --- | --- |
| `bundler-audit` | GPL-3.0-or-later | `:development, :test` | Scans `Gemfile.lock` for known CVEs in CI |
| `diff-lcs` | MIT **or** Artistic-1.0-Perl **or** GPL-2.0-or-later | `:test` (via RSpec) | Diff output in test failures |

**Position:** `bundler-audit` is invoked as a **separate process** from the
command line and is never required into the application, so the GPL's derivative
-work analysis does not reach Aixle Insights' code; it is also never
distributed. `diff-lcs` is triple-licensed and we rely on the **MIT** option.
Neither creates an obligation for this project or for people who redistribute it.

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

## 8. Third-party trademarks and logos in the web app

`packages/web/public/logos/` contains 22 vendor logos — Anthropic, Claude,
Claude Code, OpenAI, Cursor, GitHub, GitHub Copilot, GitLab, Bitbucket, Slack,
Jira, Linear, Figma, Google, Windsurf, Aider, Cody, Continue, Tabnine, Amazon Q,
OpenRouter, and a generic "custom" mark — displayed in the UI to identify the
tool each connector talks to.

**Position:** this is **nominative use** of marks that belong to their
respective owners. The logos are not licensed to you under Apache-2.0 by this
project, their presence implies no affiliation with or endorsement by those
vendors, and Aixle Insights claims no rights in them.

**When this matters:** if you fork and rebrand, review each vendor's brand
guidelines before reusing these files. The project's own marks are covered
separately by [TRADEMARK.md](TRADEMARK.md).

---

*This file is provided for notice purposes and does not constitute legal advice.
Licensing questions: `legal.insights@aixle.com`.*
