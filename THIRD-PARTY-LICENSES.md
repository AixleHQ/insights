# Third-Party Licenses

Aixle Insights is released under the [Apache License 2.0](LICENSE). This file is
the dependency-level license inventory: every third-party package the project
depends on, its version, and the license it is distributed under.

Two related files cover different ground:

- [`NOTICE`](NOTICE) — the Apache-2.0 attribution notice for Aixle Insights itself.
- [`NOTICES.md`](NOTICES.md) — narrative disclosure of the handful of components
  whose licensing is *load-bearing* for how you may run or redistribute the stack
  (Redis pinning, TimescaleDB TSL features, Sidekiq under LGPL). Read that file
  for the "what does this mean for me" analysis; read this one for the full list.

> **Scope.** This is a **source-only** release: the project does not publish
> pre-built binaries or bundled Docker images of the components below, with the
> single exception of the `@aixle/insights` CLI published to npm. Dependencies
> marked *development / test only* are never distributed in any artifact.

**Generated:** 2026-08-20, from the lockfiles committed at `053f560`.
Sources: `package-lock.json` (lockfile v3 `license` fields) for npm packages and
[rubygems.org](https://rubygems.org) version metadata for gems. See
[Regenerating this file](#regenerating-this-file).

---

## Contents

- [Components](#components)
- [License distribution](#license-distribution)
- [Licenses that need attention](#licenses-that-need-attention)
- [1. API — `packages/api` (Ruby)](#1-api--packagesapi-ruby)
- [2. Temporal worker — `temporal/` (Ruby)](#2-temporal-worker--temporal-ruby)
- [3. Web — `packages/web` (npm)](#3-web--packagesweb-npm)
- [4. CLI — `packages/tools/aixle-insights` (npm)](#4-cli--packagestoolsaixle-insights-npm)
- [Services (not linked dependencies)](#services-not-linked-dependencies)
- [Bundled third-party assets](#bundled-third-party-assets)
- [Regenerating this file](#regenerating-this-file)

---

## Components

| Component | Manifest | Distributed as | Runtime deps | Dev/test deps |
| --- | --- | --- | ---: | ---: |
| API (Rails) | `packages/api/Gemfile.lock` | source | 126 | 40 |
| Temporal worker | `temporal/Gemfile.lock` | source | 15 | 18 |
| Web (React SPA) | `packages/web/package-lock.json` | source; browser bundle | 134 | 571 |
| CLI `@aixle/insights` | `packages/tools/package-lock.json` | source; **npm package** | 154 | 106 |

Counts are resolved dependency graphs, not direct declarations. Gems are split by
Bundler group closure (anything reachable only from `group :development, :test`
is dev/test); npm packages by the lockfile `dev` flag. Platform-specific variants
of the same gem (e.g. `nokogiri` for `aarch64-linux`) are counted once.

## License distribution

| License | API | Worker | Web | CLI | Dev/test only |
| --- | ---: | ---: | ---: | ---: | ---: |
| MIT | 81 | 3 | 113 | 126 | 617 |
| ISC | — | — | 14 | 16 | 19 |
| Ruby, BSD-2-Clause | 23 | 3 | — | — | 10 |
| Apache-2.0 | 11 | 7 | 2 | 2 | 26 |
| BSD-3-Clause | 2 | 1 | 3 | 3 | 7 |
| BlueOak-1.0.0 | — | — | — | 4 | 6 |
| Ruby | 4 | — | — | — | 2 |
| BSD-2-Clause | 1 | 1 | — | 1 | 12 |
| 0BSD | — | — | 1 | — | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | — | — | — | 1 | — |
| (MIT OR WTFPL) | — | — | — | 1 | — |
| Apache 2.0 | 1 | — | — | — | — |
| LGPL-3.0 | 1 | — | — | — | — |
| MIT AND ISC | — | — | 1 | — | — |
| MIT, Apache-2.0 | 1 | — | — | — | — |
| MIT, BSD-2-Clause | 1 | — | — | — | — |
| MPL-2.0 | — | — | — | — | 24 |
| MIT, Artistic-1.0-Perl, GPL-2.0-or-later | — | — | — | — | 2 |
| MIT-0 | — | — | — | — | 2 |
| (MIT OR CC0-1.0) | — | — | — | — | 1 |
| Brakeman Public Use License | — | — | — | — | 1 |
| CC-BY-4.0 | — | — | — | — | 1 |
| CC0-1.0 | — | — | — | — | 1 |
| GPL-3.0-or-later | — | — | — | — | 1 |
| Hippocratic-2.1, MIT | — | — | — | — | 1 |
| Python-2.0 | — | — | — | — | 1 |

Runtime totals: 429 packages; dev/test-only totals: 735.

## Licenses that need attention

Everything else in the tables below is a permissive license (MIT, BSD, ISC,
Apache-2.0, 0BSD, BlueOak) with no obligations beyond attribution.

| Package | License | Where | Assessment |
| --- | --- | --- | --- |
| `sidekiq` | LGPL-3.0 | API runtime | Unmodified gem used through its public API — no copyleft on Aixle Insights code. Obligations attach only if you redistribute an artifact that embeds it. See [NOTICES.md § 7](NOTICES.md). |
| `lightningcss` (+ 11 platform binaries) | MPL-2.0 | Web + CLI build only | File-level copyleft, pulled in transitively by Vite. Build-time CSS transform: its code is not part of the browser bundle or the published CLI. Used unmodified, so the only obligation is attribution. |
| `bundler-audit` | GPL-3.0-or-later | API dev/test only | Invoked as a separate CLI process in CI; never linked into or distributed with the product. |
| `brakeman` | Brakeman Public Use License | API dev/test only | Non-OSI, free for non-commercial and internal use. Static analysis tool run in CI only — not distributed. Commercial redistribution of Brakeman itself would need a separate license. |
| `vcr` | Hippocratic-2.1 OR MIT | API test only | Ethical-source license (non-OSI) offered alongside MIT. Test-time HTTP fixture playback only. |
| `diff-lcs` | MIT / Artistic-1.0-Perl / GPL-2.0-or-later | API test only | Triple-licensed; the MIT option applies. Pulled in transitively by RSpec. |

No dependency in any runtime graph is under AGPL, GPL, or a source-available
license (SSPL/RSAL/BUSL). For the *services* the stack runs against, which are
not linked dependencies, see [Services](#services-not-linked-dependencies).

---

## 1. API — `packages/api` (Ruby)

Ruby 3.4.8, Rails 8.1. Resolved from `packages/api/Gemfile.lock`.

### Runtime (126)

| Package | Version | License |
| --- | --- | --- |
| `aasm` | 5.5.2 | MIT |
| `action_policy` | 0.7.6 | MIT |
| `action_text-trix` | 2.1.16 | MIT |
| `actioncable` | 8.1.2 | MIT |
| `actionmailbox` | 8.1.2 | MIT |
| `actionmailer` | 8.1.2 | MIT |
| `actionpack` | 8.1.2 | MIT |
| `actiontext` | 8.1.2 | MIT |
| `actionview` | 8.1.2 | MIT |
| `activejob` | 8.1.2 | MIT |
| `activemodel` | 8.1.2 | MIT |
| `activerecord` | 8.1.2 | MIT |
| `activestorage` | 8.1.2 | MIT |
| `activesupport` | 8.1.2 | MIT |
| `addressable` | 2.8.8 | Apache-2.0 |
| `administrate` | 1.0.0 | MIT |
| `alba` | 3.10.0 | MIT |
| `aws-eventstream` | 1.4.0 | Apache-2.0 |
| `aws-partitions` | 1.1209.0 | Apache-2.0 |
| `aws-sdk-core` | 3.241.4 | Apache-2.0 |
| `aws-sdk-kms` | 1.121.0 | Apache-2.0 |
| `aws-sdk-s3` | 1.212.0 | Apache-2.0 |
| `aws-sigv4` | 1.12.1 | Apache-2.0 |
| `base64` | 0.3.0 | Ruby, BSD-2-Clause |
| `bcrypt_pbkdf` | 1.1.2 | MIT |
| `bigdecimal` | 4.0.1 | Ruby, BSD-2-Clause |
| `bootsnap` | 1.21.1 | MIT |
| `builder` | 3.3.0 | MIT |
| `concurrent-ruby` | 1.3.6 | MIT |
| `connection_pool` | 3.0.2 | MIT |
| `crass` | 1.0.6 | MIT |
| `cronex` | 0.15.0 | Apache-2.0 |
| `csv` | 3.3.5 | Ruby, BSD-2-Clause |
| `date` | 3.5.1 | Ruby, BSD-2-Clause |
| `dotenv` | 3.2.0 | MIT |
| `drb` | 2.2.3 | Ruby, BSD-2-Clause |
| `ed25519` | 1.4.0 | MIT |
| `erb` | 6.0.1 | Ruby, BSD-2-Clause |
| `erubi` | 1.13.1 | MIT |
| `et-orbi` | 1.4.0 | MIT |
| `faraday` | 2.14.0 | MIT |
| `faraday-net_http` | 3.4.2 | MIT |
| `fugit` | 1.12.1 | MIT |
| `globalid` | 1.3.0 | MIT |
| `google-protobuf` | 4.35.0 | BSD-3-Clause |
| `i18n` | 1.14.8 | MIT |
| `io-console` | 0.8.2 | Ruby, BSD-2-Clause |
| `irb` | 1.16.0 | Ruby, BSD-2-Clause |
| `jmespath` | 1.6.2 | Apache-2.0 |
| `json` | 2.18.0 | Ruby |
| `json-schema` | 6.1.0 | MIT |
| `jwt` | 3.1.2 | MIT |
| `kamal` | 2.10.1 | MIT |
| `kaminari` | 1.2.2 | MIT |
| `kaminari-actionview` | 1.2.2 | MIT |
| `kaminari-activerecord` | 1.2.2 | MIT |
| `kaminari-core` | 1.2.2 | MIT |
| `logger` | 1.7.0 | Ruby, BSD-2-Clause |
| `loofah` | 2.25.0 | MIT |
| `mail` | 2.9.0 | MIT |
| `marcel` | 1.1.0 | MIT, Apache-2.0 |
| `mini_mime` | 1.1.5 | MIT |
| `minitest` | 6.0.1 | MIT |
| `msgpack` | 1.8.0 | Apache 2.0 |
| `net-http` | 0.9.1 | Ruby, BSD-2-Clause |
| `net-imap` | 0.6.2 | Ruby, BSD-2-Clause |
| `net-pop` | 0.1.2 | Ruby, BSD-2-Clause |
| `net-protocol` | 0.2.2 | Ruby, BSD-2-Clause |
| `net-scp` | 4.1.0 | MIT |
| `net-sftp` | 4.0.0 | MIT |
| `net-smtp` | 0.5.1 | Ruby, BSD-2-Clause |
| `net-ssh` | 7.3.0 | MIT |
| `nio4r` | 2.7.5 | MIT, BSD-2-Clause |
| `nokogiri` | 1.19.0-aarch64-linux-gnu | MIT |
| `ostruct` | 0.6.3 | Ruby, BSD-2-Clause |
| `pg` | 1.6.3 | BSD-2-Clause |
| `pp` | 0.6.3 | Ruby, BSD-2-Clause |
| `prettyprint` | 0.2.0 | Ruby, BSD-2-Clause |
| `prism` | 1.8.0 | MIT |
| `psych` | 5.3.1 | MIT |
| `public_suffix` | 7.0.2 | MIT |
| `puma` | 7.2.0 | BSD-3-Clause |
| `raabro` | 1.4.0 | MIT |
| `racc` | 1.8.1 | Ruby, BSD-2-Clause |
| `rack` | 3.2.4 | MIT |
| `rack-cors` | 3.0.0 | MIT |
| `rack-session` | 2.1.1 | MIT |
| `rack-test` | 2.2.0 | MIT |
| `rackup` | 2.3.1 | MIT |
| `rails` | 8.1.2 | MIT |
| `rails-dom-testing` | 2.3.0 | MIT |
| `rails-html-sanitizer` | 1.6.2 | MIT |
| `railties` | 8.1.2 | MIT |
| `rake` | 13.3.1 | MIT |
| `rdoc` | 7.1.0 | Ruby |
| `redis` | 5.4.1 | MIT |
| `redis-client` | 0.26.3 | MIT |
| `reline` | 0.6.3 | Ruby |
| `rollbar` | 3.7.0 | MIT |
| `rspec-core` | 3.13.6 | MIT |
| `rspec-support` | 3.13.6 | MIT |
| `rswag-api` | 2.17.0 | MIT |
| `rswag-specs` | 2.17.0 | MIT |
| `ruby-next-core` | 1.2.0 | MIT |
| `securerandom` | 0.4.1 | Ruby, BSD-2-Clause |
| `sidekiq` | 8.1.0 | LGPL-3.0 |
| `sidekiq-cron` | 2.3.1 | MIT |
| `solid_cable` | 3.0.12 | MIT |
| `solid_cache` | 1.0.10 | MIT |
| `solid_queue` | 1.3.1 | MIT |
| `sprockets` | 4.2.2 | MIT |
| `sprockets-rails` | 3.5.2 | MIT |
| `sshkit` | 1.25.0 | MIT |
| `stringio` | 3.2.0 | Ruby, BSD-2-Clause |
| `temporalio` | 1.4.1 | MIT |
| `thor` | 1.5.0 | MIT |
| `thruster` | 0.1.17 | MIT |
| `timeout` | 0.6.0 | Ruby, BSD-2-Clause |
| `tsort` | 0.2.0 | Ruby, BSD-2-Clause |
| `tzinfo` | 2.0.6 | MIT |
| `unicode` | 0.4.4.5 | Ruby |
| `uri` | 1.1.1 | Ruby, BSD-2-Clause |
| `useragent` | 0.16.11 | MIT |
| `websocket-driver` | 0.8.0 | Apache-2.0 |
| `websocket-extensions` | 0.1.5 | Apache-2.0 |
| `zeitwerk` | 2.7.4 | MIT |

### Development / test only (40)

Not distributed in any artifact.

- **MIT** (32): `ast`, `childprocess`, `crack`, `docile`, `factory_bot_rails`, `factory_bot`, `faker`, `hashdiff`, `language_server-protocol`, `letter_opener_web`, `letter_opener`, `lint_roller`, `parallel`, `parser`, `rainbow`, `regexp_parser`, `rspec-expectations`, `rspec-mocks`, `rspec-rails`, `rubocop-ast`, `rubocop-performance`, `rubocop-rails-omakase`, `rubocop-rails`, `rubocop`, `ruby-progressbar`, `shoulda-matchers`, `simplecov-html`, `simplecov_json_formatter`, `simplecov`, `unicode-display_width`, `unicode-emoji`, `webmock`
- **BSD-2-Clause** (1): `rexml`
- **BSD-3-Clause** (1): `ffi`
- **Brakeman Public Use License** (1): `brakeman`
- **GPL-3.0-or-later** (1): `bundler-audit`
- **Hippocratic-2.1, MIT** (1): `vcr`
- **ISC** (1): `launchy`
- **MIT, Artistic-1.0-Perl, GPL-2.0-or-later** (1): `diff-lcs`
- **Ruby, BSD-2-Clause** (1): `debug`

---

## 2. Temporal worker — `temporal/` (Ruby)

Resolved from `temporal/Gemfile.lock`.

### Runtime (15)

| Package | Version | License |
| --- | --- | --- |
| `aws-eventstream` | 1.4.0 | Apache-2.0 |
| `aws-partitions` | 1.1209.0 | Apache-2.0 |
| `aws-sdk-core` | 3.241.4 | Apache-2.0 |
| `aws-sdk-kms` | 1.121.0 | Apache-2.0 |
| `aws-sdk-s3` | 1.212.0 | Apache-2.0 |
| `aws-sigv4` | 1.12.1 | Apache-2.0 |
| `base64` | 0.3.0 | Ruby, BSD-2-Clause |
| `bigdecimal` | 4.0.1 | Ruby, BSD-2-Clause |
| `concurrent-ruby` | 1.3.6 | MIT |
| `google-protobuf` | 4.33.4 | BSD-3-Clause |
| `jmespath` | 1.6.2 | Apache-2.0 |
| `logger` | 1.7.0 | Ruby, BSD-2-Clause |
| `rake` | 13.3.1 | MIT |
| `rexml` | 3.4.4 | BSD-2-Clause |
| `temporalio` | 1.1.0 | MIT |

### Development / test only (18)

- **Ruby, BSD-2-Clause** (9): `date`, `debug`, `erb`, `io-console`, `irb`, `pp`, `prettyprint`, `stringio`, `tsort`
- **MIT** (6): `psych`, `rspec-core`, `rspec-expectations`, `rspec-mocks`, `rspec-support`, `rspec`
- **Ruby** (2): `rdoc`, `reline`
- **MIT, Artistic-1.0-Perl, GPL-2.0-or-later** (1): `diff-lcs`

---

## 3. Web — `packages/web` (npm)

React 19 SPA built with Vite. Runtime packages are the ones that can end up in
the browser bundle shipped to users. Resolved from `packages/web/package-lock.json`.

### Runtime (134)

| Package | Version | License |
| --- | --- | --- |
| `@babel/runtime` | 7.29.7 | MIT |
| `@floating-ui/core` | 1.7.5 | MIT |
| `@floating-ui/dom` | 1.7.6 | MIT |
| `@floating-ui/react-dom` | 2.1.8 | MIT |
| `@floating-ui/utils` | 0.2.11 | MIT |
| `@radix-ui/number` | 1.1.2 | MIT |
| `@radix-ui/primitive` | 1.1.4 | MIT |
| `@radix-ui/react-alert-dialog` | 1.1.17 | MIT |
| `@radix-ui/react-arrow` | 1.1.10 | MIT |
| `@radix-ui/react-avatar` | 1.2.0 | MIT |
| `@radix-ui/react-checkbox` | 1.3.5 | MIT |
| `@radix-ui/react-collection` | 1.1.10 | MIT |
| `@radix-ui/react-compose-refs` | 1.1.3 | MIT |
| `@radix-ui/react-context` | 1.1.4 | MIT |
| `@radix-ui/react-dialog` | 1.1.17 | MIT |
| `@radix-ui/react-direction` | 1.1.2 | MIT |
| `@radix-ui/react-dismissable-layer` | 1.1.13 | MIT |
| `@radix-ui/react-dropdown-menu` | 2.1.18 | MIT |
| `@radix-ui/react-focus-guards` | 1.1.4 | MIT |
| `@radix-ui/react-focus-scope` | 1.1.10 | MIT |
| `@radix-ui/react-id` | 1.1.2 | MIT |
| `@radix-ui/react-label` | 2.1.10 | MIT |
| `@radix-ui/react-menu` | 2.1.18 | MIT |
| `@radix-ui/react-popover` | 1.1.17 | MIT |
| `@radix-ui/react-popper` | 1.3.1 | MIT |
| `@radix-ui/react-portal` | 1.1.12 | MIT |
| `@radix-ui/react-presence` | 1.1.6 | MIT |
| `@radix-ui/react-primitive` | 2.1.6 | MIT |
| `@radix-ui/react-progress` | 1.1.10 | MIT |
| `@radix-ui/react-roving-focus` | 1.1.13 | MIT |
| `@radix-ui/react-scroll-area` | 1.2.12 | MIT |
| `@radix-ui/react-select` | 2.3.1 | MIT |
| `@radix-ui/react-separator` | 1.1.10 | MIT |
| `@radix-ui/react-slot` | 1.3.0 | MIT |
| `@radix-ui/react-switch` | 1.3.1 | MIT |
| `@radix-ui/react-tabs` | 1.1.15 | MIT |
| `@radix-ui/react-tooltip` | 1.2.10 | MIT |
| `@radix-ui/react-use-callback-ref` | 1.1.2 | MIT |
| `@radix-ui/react-use-controllable-state` | 1.2.3 | MIT |
| `@radix-ui/react-use-effect-event` | 0.0.3 | MIT |
| `@radix-ui/react-use-escape-keydown` | 1.1.2 | MIT |
| `@radix-ui/react-use-is-hydrated` | 0.1.1 | MIT |
| `@radix-ui/react-use-layout-effect` | 1.1.2 | MIT |
| `@radix-ui/react-use-previous` | 1.1.2 | MIT |
| `@radix-ui/react-use-rect` | 1.1.2 | MIT |
| `@radix-ui/react-use-size` | 1.1.2 | MIT |
| `@radix-ui/react-visually-hidden` | 1.2.6 | MIT |
| `@radix-ui/rect` | 1.1.2 | MIT |
| `@rollbar/react` | 1.0.0 | MIT |
| `@rrweb/record` | 2.0.1 | MIT |
| `@rrweb/types` | 2.0.1 | MIT |
| `@rrweb/utils` | 2.0.1 | MIT |
| `@tanstack/query-core` | 5.101.0 | MIT |
| `@tanstack/react-query` | 5.101.0 | MIT |
| `@types/css-font-loading-module` | 0.0.7 | MIT |
| `@types/d3-array` | 3.2.2 | MIT |
| `@types/d3-color` | 3.1.3 | MIT |
| `@types/d3-ease` | 3.0.2 | MIT |
| `@types/d3-interpolate` | 3.0.4 | MIT |
| `@types/d3-path` | 3.1.1 | MIT |
| `@types/d3-scale` | 4.0.9 | MIT |
| `@types/d3-shape` | 3.1.8 | MIT |
| `@types/d3-time` | 3.0.4 | MIT |
| `@types/d3-timer` | 3.0.2 | MIT |
| `@xstate/fsm` | 1.6.5 | MIT |
| `aria-hidden` | 1.2.6 | MIT |
| `async` | 3.2.6 | MIT |
| `base64-arraybuffer` | 1.0.2 | MIT |
| `class-variance-authority` | 0.7.1 | Apache-2.0 |
| `clsx` | 2.1.1 | MIT |
| `cmdk` | 1.1.1 | MIT |
| `cookie` | 1.1.1 | MIT |
| `csstype` | 3.2.3 | MIT |
| `d3-array` | 3.2.4 | ISC |
| `d3-color` | 3.1.0 | ISC |
| `d3-ease` | 3.0.1 | BSD-3-Clause |
| `d3-format` | 3.1.2 | ISC |
| `d3-interpolate` | 3.0.1 | ISC |
| `d3-path` | 3.1.0 | ISC |
| `d3-scale` | 4.0.2 | ISC |
| `d3-shape` | 3.2.0 | ISC |
| `d3-time` | 3.1.0 | ISC |
| `d3-time-format` | 4.1.0 | ISC |
| `d3-timer` | 3.0.1 | ISC |
| `decimal.js-light` | 2.5.1 | MIT |
| `detect-node-es` | 1.1.0 | MIT |
| `dom-helpers` | 5.2.1 | MIT |
| `error-stack-parser-es` | 1.0.5 | MIT |
| `eventemitter3` | 4.0.7 | MIT |
| `fast-equals` | 5.4.0 | MIT |
| `get-nonce` | 1.0.1 | MIT |
| `internmap` | 2.0.3 | ISC |
| `js-tokens` | 4.0.0 | MIT |
| `json-stringify-safe` | 5.0.1 | ISC |
| `jwt-decode` | 4.0.0 | MIT |
| `lodash` | 4.18.1 | MIT |
| `loose-envify` | 1.4.0 | MIT |
| `lru-cache` | 2.2.4 | MIT |
| `lucide-react` | 0.563.0 | ISC |
| `mitt` | 3.0.1 | MIT |
| `nanoid` | 3.3.12 | MIT |
| `object-assign` | 4.1.1 | MIT |
| `oidc-client-ts` | 3.5.0 | Apache-2.0 |
| `picocolors` | 1.1.1 | ISC |
| `postcss` | 8.5.15 | MIT |
| `prop-types` | 15.8.1 | MIT |
| `react` | 19.2.7 | MIT |
| `react-dom` | 19.2.7 | MIT |
| `react-error-boundary` | 6.1.2 | MIT |
| `react-is` | 18.3.1 | MIT |
| `react-remove-scroll` | 2.7.2 | MIT |
| `react-remove-scroll-bar` | 2.3.8 | MIT |
| `react-router` | 7.18.0 | MIT |
| `react-router-dom` | 7.18.0 | MIT |
| `react-smooth` | 4.0.4 | MIT |
| `react-style-singleton` | 2.2.3 | MIT |
| `react-transition-group` | 4.4.5 | BSD-3-Clause |
| `recharts` | 2.15.4 | MIT |
| `recharts-scale` | 0.4.5 | MIT |
| `request-ip` | 3.3.0 | MIT |
| `rollbar` | 3.1.0 | MIT |
| `rrdom` | 2.0.1 | MIT |
| `rrweb` | 2.0.1 | MIT |
| `rrweb-snapshot` | 2.0.1 | MIT |
| `scheduler` | 0.27.0 | MIT |
| `set-cookie-parser` | 2.7.2 | MIT |
| `sonner` | 2.0.7 | MIT |
| `source-map-js` | 1.2.1 | BSD-3-Clause |
| `tailwind-merge` | 3.6.0 | MIT |
| `tiny-invariant` | 1.3.3 | MIT |
| `tslib` | 2.8.1 | 0BSD |
| `use-callback-ref` | 1.3.3 | MIT |
| `use-sidecar` | 1.1.3 | MIT |
| `victory-vendor` | 36.9.2 | MIT AND ISC |

### Development / build only (571)

Build toolchain, linters, and test runners — not shipped in the bundle.

- **MIT** (491): `@acemir/cssom`, `@adobe/css-tools`, `@apideck/better-ajv-errors`, `@asamuzakjp/css-color`, `@asamuzakjp/dom-selector`, `@asamuzakjp/nwsapi`, `@babel/code-frame`, `@babel/compat-data`, `@babel/core`, `@babel/generator`, `@babel/helper-annotate-as-pure`, `@babel/helper-compilation-targets`, `@babel/helper-create-class-features-plugin`, `@babel/helper-create-regexp-features-plugin`, `@babel/helper-define-polyfill-provider`, `@babel/helper-globals`, `@babel/helper-member-expression-to-functions`, `@babel/helper-module-imports`, `@babel/helper-module-transforms`, `@babel/helper-optimise-call-expression`, `@babel/helper-plugin-utils`, `@babel/helper-remap-async-to-generator`, `@babel/helper-replace-supers`, `@babel/helper-skip-transparent-expression-wrappers`, `@babel/helper-string-parser`, `@babel/helper-validator-identifier`, `@babel/helper-validator-option`, `@babel/helper-wrap-function`, `@babel/helpers`, `@babel/parser`, `@babel/plugin-bugfix-firefox-class-in-computed-class-key`, `@babel/plugin-bugfix-safari-class-field-initializer-scope`, `@babel/plugin-bugfix-safari-id-destructuring-collision-in-function-expression`, `@babel/plugin-bugfix-safari-rest-destructuring-rhs-array`, `@babel/plugin-bugfix-v8-spread-parameters-in-optional-chaining`, `@babel/plugin-bugfix-v8-static-class-fields-redefine-readonly`, `@babel/plugin-proposal-private-property-in-object`, `@babel/plugin-syntax-import-assertions`, `@babel/plugin-syntax-import-attributes`, `@babel/plugin-syntax-unicode-sets-regex`, `@babel/plugin-transform-arrow-functions`, `@babel/plugin-transform-async-generator-functions`, `@babel/plugin-transform-async-to-generator`, `@babel/plugin-transform-block-scoped-functions`, `@babel/plugin-transform-block-scoping`, `@babel/plugin-transform-class-properties`, `@babel/plugin-transform-class-static-block`, `@babel/plugin-transform-classes`, `@babel/plugin-transform-computed-properties`, `@babel/plugin-transform-destructuring`, `@babel/plugin-transform-dotall-regex`, `@babel/plugin-transform-duplicate-keys`, `@babel/plugin-transform-duplicate-named-capturing-groups-regex`, `@babel/plugin-transform-dynamic-import`, `@babel/plugin-transform-explicit-resource-management`, `@babel/plugin-transform-exponentiation-operator`, `@babel/plugin-transform-export-namespace-from`, `@babel/plugin-transform-for-of`, `@babel/plugin-transform-function-name`, `@babel/plugin-transform-json-strings`, `@babel/plugin-transform-literals`, `@babel/plugin-transform-logical-assignment-operators`, `@babel/plugin-transform-member-expression-literals`, `@babel/plugin-transform-modules-amd`, `@babel/plugin-transform-modules-commonjs`, `@babel/plugin-transform-modules-systemjs`, `@babel/plugin-transform-modules-umd`, `@babel/plugin-transform-named-capturing-groups-regex`, `@babel/plugin-transform-new-target`, `@babel/plugin-transform-nullish-coalescing-operator`, `@babel/plugin-transform-numeric-separator`, `@babel/plugin-transform-object-rest-spread`, `@babel/plugin-transform-object-super`, `@babel/plugin-transform-optional-catch-binding`, `@babel/plugin-transform-optional-chaining`, `@babel/plugin-transform-parameters`, `@babel/plugin-transform-private-methods`, `@babel/plugin-transform-private-property-in-object`, `@babel/plugin-transform-property-literals`, `@babel/plugin-transform-regenerator`, `@babel/plugin-transform-regexp-modifiers`, `@babel/plugin-transform-reserved-words`, `@babel/plugin-transform-shorthand-properties`, `@babel/plugin-transform-spread`, `@babel/plugin-transform-sticky-regex`, `@babel/plugin-transform-template-literals`, `@babel/plugin-transform-typeof-symbol`, `@babel/plugin-transform-unicode-escapes`, `@babel/plugin-transform-unicode-property-regex`, `@babel/plugin-transform-unicode-regex`, `@babel/plugin-transform-unicode-sets-regex`, `@babel/preset-env`, `@babel/preset-modules`, `@babel/template`, `@babel/traverse`, `@babel/types`, `@csstools/css-calc`, `@csstools/css-color-parser`, `@csstools/css-parser-algorithms`, `@csstools/css-tokenizer`, `@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@eslint-community/eslint-utils`, `@eslint-community/regexpp`, `@eslint/eslintrc`, `@eslint/js`, `@exodus/bytes`, `@jridgewell/gen-mapping`, `@jridgewell/remapping`, `@jridgewell/resolve-uri`, `@jridgewell/source-map`, `@jridgewell/sourcemap-codec`, `@jridgewell/trace-mapping`, `@napi-rs/wasm-runtime`, `@oxc-project/types`, `@rolldown/binding-android-arm64`, `@rolldown/binding-darwin-arm64`, `@rolldown/binding-darwin-x64`, `@rolldown/binding-freebsd-x64`, `@rolldown/binding-linux-arm-gnueabihf`, `@rolldown/binding-linux-arm64-gnu`, `@rolldown/binding-linux-arm64-musl`, `@rolldown/binding-linux-ppc64-gnu`, `@rolldown/binding-linux-s390x-gnu`, `@rolldown/binding-linux-x64-gnu`, `@rolldown/binding-linux-x64-musl`, `@rolldown/binding-openharmony-arm64`, `@rolldown/binding-wasm32-wasi`, `@rolldown/binding-win32-arm64-msvc`, `@rolldown/binding-win32-x64-msvc`, `@rolldown/pluginutils`, `@rollup/plugin-babel`, `@rollup/plugin-node-resolve`, `@rollup/plugin-replace`, `@rollup/plugin-terser`, `@rollup/pluginutils`, `@rollup/rollup-android-arm-eabi`, `@rollup/rollup-android-arm64`, `@rollup/rollup-darwin-arm64`, `@rollup/rollup-darwin-x64`, `@rollup/rollup-freebsd-arm64`, `@rollup/rollup-freebsd-x64`, `@rollup/rollup-linux-arm-gnueabihf`, `@rollup/rollup-linux-arm-musleabihf`, `@rollup/rollup-linux-arm64-gnu`, `@rollup/rollup-linux-arm64-musl`, `@rollup/rollup-linux-loong64-gnu`, `@rollup/rollup-linux-loong64-musl`, `@rollup/rollup-linux-ppc64-gnu`, `@rollup/rollup-linux-ppc64-musl`, `@rollup/rollup-linux-riscv64-gnu`, `@rollup/rollup-linux-riscv64-musl`, `@rollup/rollup-linux-s390x-gnu`, `@rollup/rollup-linux-x64-gnu`, `@rollup/rollup-linux-x64-musl`, `@rollup/rollup-openbsd-x64`, `@rollup/rollup-openharmony-arm64`, `@rollup/rollup-win32-arm64-msvc`, `@rollup/rollup-win32-ia32-msvc`, `@rollup/rollup-win32-x64-gnu`, `@rollup/rollup-win32-x64-msvc`, `@standard-schema/spec`, `@tailwindcss/node`, `@tailwindcss/oxide-android-arm64`, `@tailwindcss/oxide-darwin-arm64`, `@tailwindcss/oxide-darwin-x64`, `@tailwindcss/oxide-freebsd-x64`, `@tailwindcss/oxide-linux-arm-gnueabihf`, `@tailwindcss/oxide-linux-arm64-gnu`, `@tailwindcss/oxide-linux-arm64-musl`, `@tailwindcss/oxide-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-musl`, `@tailwindcss/oxide-wasm32-wasi`, `@tailwindcss/oxide-win32-arm64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`, `@tailwindcss/oxide`, `@tailwindcss/vite`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `@tybys/wasm-util`, `@types/aria-query`, `@types/chai`, `@types/deep-eql`, `@types/estree`, `@types/json-schema`, `@types/node`, `@types/react-dom`, `@types/react`, `@types/resolve`, `@types/trusted-types`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/project-service`, `@typescript-eslint/scope-manager`, `@typescript-eslint/tsconfig-utils`, `@typescript-eslint/type-utils`, `@typescript-eslint/types`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`, `@typescript-eslint/visitor-keys`, `@vitejs/plugin-react`, `@vitest/expect`, `@vitest/mocker`, `@vitest/pretty-format`, `@vitest/runner`, `@vitest/snapshot`, `@vitest/spy`, `@vitest/utils`, `acorn-jsx`, `acorn`, `agent-base`, `ajv`, `ansi-regex`, `ansi-styles`, `array-buffer-byte-length`, `arraybuffer.prototype.slice`, `assertion-error`, `async-function`, `available-typed-arrays`, `babel-plugin-polyfill-corejs2`, `babel-plugin-polyfill-corejs3`, `babel-plugin-polyfill-regenerator`, `balanced-match`, `bidi-js`, `brace-expansion`, `browserslist`, `buffer-from`, `call-bind-apply-helpers`, `call-bind`, `call-bound`, `callsites`, `chai`, `chalk`, `color-convert`, `color-name`, `commander`, `common-tags`, `concat-map`, `convert-source-map`, `core-js-compat`, `cross-spawn`, `crypto-random-string`, `css-tree`, `css.escape`, `cssstyle`, `data-urls`, `data-view-buffer`, `data-view-byte-length`, `data-view-byte-offset`, `debug`, `decimal.js`, `deep-is`, `deepmerge`, `define-data-property`, `define-properties`, `dequal`, `dom-accessibility-api`, `dunder-proto`, `enhanced-resolve`, `es-abstract-get`, `es-abstract`, `es-define-property`, `es-errors`, `es-module-lexer`, `es-object-atoms`, `es-set-tostringtag`, `es-to-primitive`, `escalade`, `escape-string-regexp`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint`, `estree-walker`, `eta`, `fast-deep-equal`, `fast-json-stable-stringify`, `fast-levenshtein`, `fdir`, `file-entry-cache`, `find-up`, `flat-cache`, `for-each`, `fs-extra`, `fsevents`, `function-bind`, `function.prototype.name`, `functions-have-names`, `generator-function`, `gensync`, `get-intrinsic`, `get-proto`, `get-symbol-description`, `globals`, `globalthis`, `gopd`, `has-bigints`, `has-flag`, `has-property-descriptors`, `has-proto`, `has-symbols`, `has-tostringtag`, `hasown`, `hermes-estree`, `hermes-parser`, `html-encoding-sniffer`, `http-proxy-agent`, `https-proxy-agent`, `ignore`, `import-fresh`, `imurmurhash`, `indent-string`, `internal-slot`, `is-array-buffer`, `is-async-function`, `is-bigint`, `is-boolean-object`, `is-callable`, `is-core-module`, `is-data-view`, `is-date-object`, `is-document.all`, `is-extglob`, `is-finalizationregistry`, `is-generator-function`, `is-glob`, `is-map`, `is-module`, `is-negative-zero`, `is-number-object`, `is-obj`, `is-potential-custom-element-name`, `is-regex`, `is-regexp`, `is-set`, `is-shared-array-buffer`, `is-stream`, `is-string`, `is-symbol`, `is-typed-array`, `is-weakmap`, `is-weakref`, `is-weakset`, `isarray`, `jiti`, `js-yaml`, `jsdom`, `jsesc`, `json-buffer`, `json-schema-traverse`, `json-stable-stringify-without-jsonify`, `json5`, `jsonfile`, `jsonpointer`, `keyv`, `leven`, `levn`, `locate-path`, `lodash.debounce`, `lodash.merge`, `lodash.sortby`, `lz-string`, `magic-string`, `math-intrinsics`, `min-indent`, `ms`, `natural-compare`, `node-releases`, `object-inspect`, `object-keys`, `object.assign`, `obug`, `optionator`, `own-keys`, `p-limit`, `p-locate`, `parent-module`, `parse5`, `path-exists`, `path-key`, `path-parse`, `pathe`, `picomatch`, `possible-typed-array-names`, `prelude-ls`, `pretty-bytes`, `pretty-format`, `punycode`, `redent`, `reflect.getprototypeof`, `regenerate-unicode-properties`, `regenerate`, `regexp.prototype.flags`, `regexpu-core`, `regjsgen`, `require-from-string`, `resolve-from`, `resolve`, `rolldown`, `rollup`, `safe-array-concat`, `safe-push-apply`, `safe-regex-test`, `set-function-length`, `set-function-name`, `set-proto`, `shebang-command`, `shebang-regex`, `side-channel-list`, `side-channel-map`, `side-channel-weakmap`, `side-channel`, `smob`, `source-map-support`, `stackback`, `std-env`, `stop-iteration-iterator`, `string.prototype.matchall`, `string.prototype.trim`, `string.prototype.trimend`, `string.prototype.trimstart`, `strip-comments`, `strip-indent`, `strip-json-comments`, `supports-color`, `supports-preserve-symlinks-flag`, `symbol-tree`, `tailwindcss`, `tapable`, `temp-dir`, `tempy`, `tinybench`, `tinyexec`, `tinyglobby`, `tinyrainbow`, `tldts-core`, `tldts`, `tr46`, `ts-api-utils`, `tw-animate-css`, `type-check`, `typed-array-buffer`, `typed-array-byte-length`, `typed-array-byte-offset`, `typed-array-length`, `typescript-eslint`, `unbox-primitive`, `undici-types`, `unicode-canonical-property-names-ecmascript`, `unicode-match-property-ecmascript`, `unicode-match-property-value-ecmascript`, `unicode-property-aliases-ecmascript`, `unique-string`, `universalify`, `upath`, `update-browserslist-db`, `vite-plugin-pwa`, `vite`, `vitest`, `w3c-xmlserializer`, `whatwg-mimetype`, `whatwg-url`, `which-boxed-primitive`, `which-builtin-type`, `which-collection`, `which-typed-array`, `why-is-node-running`, `word-wrap`, `workbox-background-sync`, `workbox-broadcast-update`, `workbox-build`, `workbox-cacheable-response`, `workbox-core`, `workbox-expiration`, `workbox-google-analytics`, `workbox-navigation-preload`, `workbox-precaching`, `workbox-range-requests`, `workbox-recipes`, `workbox-routing`, `workbox-strategies`, `workbox-streams`, `workbox-sw`, `workbox-window`, `ws`, `xmlchars`, `yocto-queue`, `zod-validation-error`, `zod`
- **Apache-2.0** (24): `@eslint/config-array`, `@eslint/config-helpers`, `@eslint/core`, `@eslint/object-schema`, `@eslint/plugin-kit`, `@humanfs/core`, `@humanfs/node`, `@humanfs/types`, `@humanwhocodes/module-importer`, `@humanwhocodes/retry`, `@playwright/test`, `@trickfilm400/rollup-plugin-off-main-thread`, `aria-query`, `baseline-browser-mapping`, `detect-libc`, `ejs`, `eslint-visitor-keys`, `expect-type`, `filelist`, `jake`, `playwright-core`, `playwright`, `typescript`, `xml-name-validator`
- **ISC** (16): `at-least-node`, `electron-to-chromium`, `flatted`, `foreground-child`, `get-own-enumerable-property-symbols`, `glob-parent`, `graceful-fs`, `idb`, `isexe`, `minimatch`, `saxes`, `semver`, `siginfo`, `signal-exit`, `which`, `yallist`
- **MPL-2.0** (12): `lightningcss-android-arm64`, `lightningcss-darwin-arm64`, `lightningcss-darwin-x64`, `lightningcss-freebsd-x64`, `lightningcss-linux-arm-gnueabihf`, `lightningcss-linux-arm64-gnu`, `lightningcss-linux-arm64-musl`, `lightningcss-linux-x64-gnu`, `lightningcss-linux-x64-musl`, `lightningcss-win32-arm64-msvc`, `lightningcss-win32-x64-msvc`, `lightningcss`
- **BSD-2-Clause** (11): `entities`, `eslint-scope`, `espree`, `esrecurse`, `estraverse`, `esutils`, `regjsparser`, `stringify-object`, `terser`, `uri-js`, `webidl-conversions`
- **BlueOak-1.0.0** (6): `@isaacs/cliui`, `glob`, `jackspeak`, `minipass`, `package-json-from-dist`, `path-scurry`
- **BSD-3-Clause** (5): `esquery`, `fast-uri`, `serialize-javascript`, `source-map`, `tough-cookie`
- **MIT-0** (2): `@csstools/color-helpers`, `@csstools/css-syntax-patches-for-csstree`
- **(MIT OR CC0-1.0)** (1): `type-fest`
- **CC-BY-4.0** (1): `caniuse-lite`
- **CC0-1.0** (1): `mdn-data`
- **Python-2.0** (1): `argparse`

---

## 4. CLI — `packages/tools/aixle-insights` (npm)

Published to npm as [`@aixle/insights`](https://www.npmjs.com/package/@aixle/insights)
under Apache-2.0. This is the one artifact the project distributes in built form,
so its runtime dependencies ship with it. Resolved from
`packages/tools/package-lock.json` (npm workspace).

### Runtime (154)

| Package | Version | License |
| --- | --- | --- |
| `@hono/node-server` | 1.19.14 | MIT |
| `@isaacs/cliui` | 8.0.2 | ISC |
| `@modelcontextprotocol/sdk` | 1.29.0 | MIT |
| `@pkgjs/parseargs` | 0.11.0 | MIT |
| `accepts` | 2.0.0 | MIT |
| `ajv` | 8.20.0 | MIT |
| `ajv-formats` | 3.0.1 | MIT |
| `ansi-regex` | 5.0.1 | MIT |
| `ansi-styles` | 4.3.0 | MIT |
| `balanced-match` | 1.0.2 | MIT |
| `base64-js` | 1.5.1 | MIT |
| `better-sqlite3` | 12.11.1 | MIT |
| `bindings` | 1.5.0 | MIT |
| `bl` | 4.1.0 | MIT |
| `body-parser` | 2.3.0 | MIT |
| `brace-expansion` | 2.1.1 | MIT |
| `buffer` | 5.7.1 | MIT |
| `bytes` | 3.1.2 | MIT |
| `call-bind-apply-helpers` | 1.0.2 | MIT |
| `call-bound` | 1.0.4 | MIT |
| `chownr` | 1.1.4 | ISC |
| `color-convert` | 2.0.1 | MIT |
| `color-name` | 1.1.4 | MIT |
| `content-disposition` | 1.1.0 | MIT |
| `content-type` | 2.0.0 | MIT |
| `cookie` | 0.7.2 | MIT |
| `cookie-signature` | 1.2.2 | MIT |
| `cors` | 2.8.6 | MIT |
| `cross-spawn` | 7.0.6 | MIT |
| `debug` | 4.4.3 | MIT |
| `decompress-response` | 6.0.0 | MIT |
| `deep-extend` | 0.6.0 | MIT |
| `depd` | 2.0.0 | MIT |
| `detect-libc` | 2.1.2 | Apache-2.0 |
| `dunder-proto` | 1.0.1 | MIT |
| `eastasianwidth` | 0.2.0 | MIT |
| `ee-first` | 1.1.1 | MIT |
| `emoji-regex` | 8.0.0 | MIT |
| `encodeurl` | 2.0.0 | MIT |
| `end-of-stream` | 1.4.5 | MIT |
| `es-define-property` | 1.0.1 | MIT |
| `es-errors` | 1.3.0 | MIT |
| `es-object-atoms` | 1.1.2 | MIT |
| `escape-html` | 1.0.3 | MIT |
| `etag` | 1.8.1 | MIT |
| `eventsource` | 3.0.7 | MIT |
| `eventsource-parser` | 3.1.0 | MIT |
| `expand-template` | 2.0.3 | (MIT OR WTFPL) |
| `express` | 5.2.1 | MIT |
| `express-rate-limit` | 8.5.2 | MIT |
| `fast-deep-equal` | 3.1.3 | MIT |
| `fast-uri` | 3.1.2 | BSD-3-Clause |
| `file-uri-to-path` | 1.0.0 | MIT |
| `finalhandler` | 2.1.1 | MIT |
| `foreground-child` | 3.3.1 | ISC |
| `forwarded` | 0.2.0 | MIT |
| `fresh` | 2.0.0 | MIT |
| `fs-constants` | 1.0.0 | MIT |
| `function-bind` | 1.1.2 | MIT |
| `get-intrinsic` | 1.3.0 | MIT |
| `get-proto` | 1.0.1 | MIT |
| `github-from-package` | 0.0.0 | MIT |
| `glob` | 10.5.0 | ISC |
| `gopd` | 1.2.0 | MIT |
| `has-symbols` | 1.1.0 | MIT |
| `hasown` | 2.0.4 | MIT |
| `hono` | 4.12.27 | MIT |
| `http-errors` | 2.0.1 | MIT |
| `iconv-lite` | 0.7.2 | MIT |
| `ieee754` | 1.2.1 | BSD-3-Clause |
| `inherits` | 2.0.4 | ISC |
| `ini` | 1.3.8 | ISC |
| `ip-address` | 10.2.0 | MIT |
| `ipaddr.js` | 1.9.1 | MIT |
| `is-fullwidth-code-point` | 3.0.0 | MIT |
| `is-promise` | 4.0.0 | MIT |
| `isexe` | 2.0.0 | ISC |
| `jackspeak` | 3.4.3 | BlueOak-1.0.0 |
| `jose` | 6.2.3 | MIT |
| `json-schema-traverse` | 1.0.0 | MIT |
| `json-schema-typed` | 8.0.2 | BSD-2-Clause |
| `keytar` | 7.9.0 | MIT |
| `lru-cache` | 10.4.3 | ISC |
| `math-intrinsics` | 1.1.0 | MIT |
| `media-typer` | 1.1.0 | MIT |
| `merge-descriptors` | 2.0.0 | MIT |
| `mime-db` | 1.54.0 | MIT |
| `mime-types` | 3.0.2 | MIT |
| `mimic-response` | 3.1.0 | MIT |
| `minimatch` | 9.0.9 | ISC |
| `minimist` | 1.2.8 | MIT |
| `minipass` | 7.1.3 | BlueOak-1.0.0 |
| `mkdirp-classic` | 0.5.3 | MIT |
| `ms` | 2.1.3 | MIT |
| `napi-build-utils` | 2.0.0 | MIT |
| `negotiator` | 1.0.0 | MIT |
| `node-abi` | 3.92.0 | MIT |
| `node-addon-api` | 4.3.0 | MIT |
| `object-assign` | 4.1.1 | MIT |
| `object-inspect` | 1.13.4 | MIT |
| `on-finished` | 2.4.1 | MIT |
| `once` | 1.4.0 | ISC |
| `package-json-from-dist` | 1.0.1 | BlueOak-1.0.0 |
| `parseurl` | 1.3.3 | MIT |
| `path-key` | 3.1.1 | MIT |
| `path-scurry` | 1.11.1 | BlueOak-1.0.0 |
| `path-to-regexp` | 8.4.2 | MIT |
| `pkce-challenge` | 5.0.1 | MIT |
| `prebuild-install` | 7.1.3 | MIT |
| `proxy-addr` | 2.0.7 | MIT |
| `pump` | 3.0.4 | MIT |
| `qs` | 6.15.3 | BSD-3-Clause |
| `range-parser` | 1.3.0 | MIT |
| `raw-body` | 3.0.2 | MIT |
| `rc` | 1.2.8 | (BSD-2-Clause OR MIT OR Apache-2.0) |
| `readable-stream` | 3.6.2 | MIT |
| `require-from-string` | 2.0.2 | MIT |
| `router` | 2.2.0 | MIT |
| `safe-buffer` | 5.2.1 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `semver` | 7.8.5 | ISC |
| `send` | 1.2.1 | MIT |
| `serve-static` | 2.2.1 | MIT |
| `setprototypeof` | 1.2.0 | ISC |
| `shebang-command` | 2.0.0 | MIT |
| `shebang-regex` | 3.0.0 | MIT |
| `side-channel` | 1.1.1 | MIT |
| `side-channel-list` | 1.0.1 | MIT |
| `side-channel-map` | 1.0.1 | MIT |
| `side-channel-weakmap` | 1.0.2 | MIT |
| `signal-exit` | 4.1.0 | ISC |
| `simple-concat` | 1.0.1 | MIT |
| `simple-get` | 4.0.1 | MIT |
| `statuses` | 2.0.2 | MIT |
| `string-width` | 4.2.3 | MIT |
| `string-width-cjs` | 4.2.3 | MIT |
| `string_decoder` | 1.3.0 | MIT |
| `strip-ansi` | 6.0.1 | MIT |
| `strip-ansi-cjs` | 6.0.1 | MIT |
| `strip-json-comments` | 2.0.1 | MIT |
| `tar-fs` | 2.1.5 | MIT |
| `tar-stream` | 2.2.0 | MIT |
| `toidentifier` | 1.0.1 | MIT |
| `tunnel-agent` | 0.6.0 | Apache-2.0 |
| `type-is` | 2.1.0 | MIT |
| `unpipe` | 1.0.0 | MIT |
| `util-deprecate` | 1.0.2 | MIT |
| `vary` | 1.1.2 | MIT |
| `which` | 2.0.2 | ISC |
| `wrap-ansi` | 8.1.0 | MIT |
| `wrap-ansi-cjs` | 7.0.0 | MIT |
| `wrappy` | 1.0.2 | ISC |
| `zod` | 4.4.3 | MIT |
| `zod-to-json-schema` | 3.25.2 | ISC |

### Development / build only (106)

- **MIT** (88): `@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@esbuild/aix-ppc64`, `@esbuild/android-arm64`, `@esbuild/android-arm`, `@esbuild/android-x64`, `@esbuild/darwin-arm64`, `@esbuild/darwin-x64`, `@esbuild/freebsd-arm64`, `@esbuild/freebsd-x64`, `@esbuild/linux-arm64`, `@esbuild/linux-arm`, `@esbuild/linux-ia32`, `@esbuild/linux-loong64`, `@esbuild/linux-mips64el`, `@esbuild/linux-ppc64`, `@esbuild/linux-riscv64`, `@esbuild/linux-s390x`, `@esbuild/linux-x64`, `@esbuild/netbsd-arm64`, `@esbuild/netbsd-x64`, `@esbuild/openbsd-arm64`, `@esbuild/openbsd-x64`, `@esbuild/openharmony-arm64`, `@esbuild/sunos-x64`, `@esbuild/win32-arm64`, `@esbuild/win32-ia32`, `@esbuild/win32-x64`, `@jridgewell/sourcemap-codec`, `@napi-rs/wasm-runtime`, `@oxc-project/types`, `@rolldown/binding-android-arm64`, `@rolldown/binding-darwin-arm64`, `@rolldown/binding-darwin-x64`, `@rolldown/binding-freebsd-x64`, `@rolldown/binding-linux-arm-gnueabihf`, `@rolldown/binding-linux-arm64-gnu`, `@rolldown/binding-linux-arm64-musl`, `@rolldown/binding-linux-ppc64-gnu`, `@rolldown/binding-linux-s390x-gnu`, `@rolldown/binding-linux-x64-gnu`, `@rolldown/binding-linux-x64-musl`, `@rolldown/binding-openharmony-arm64`, `@rolldown/binding-wasm32-wasi`, `@rolldown/binding-win32-arm64-msvc`, `@rolldown/binding-win32-x64-msvc`, `@rolldown/pluginutils`, `@standard-schema/spec`, `@tybys/wasm-util`, `@types/better-sqlite3`, `@types/chai`, `@types/deep-eql`, `@types/estree`, `@types/node`, `@vitest/expect`, `@vitest/mocker`, `@vitest/pretty-format`, `@vitest/runner`, `@vitest/snapshot`, `@vitest/spy`, `@vitest/utils`, `assertion-error`, `chai`, `convert-source-map`, `es-module-lexer`, `esbuild`, `estree-walker`, `fdir`, `fsevents`, `magic-string`, `nanoid`, `obug`, `pathe`, `picomatch`, `postcss`, `rolldown`, `stackback`, `std-env`, `tinybench`, `tinyexec`, `tinyglobby`, `tinyrainbow`, `tsx`, `undici-types`, `vite`, `vitest`, `why-is-node-running`
- **MPL-2.0** (12): `lightningcss-android-arm64`, `lightningcss-darwin-arm64`, `lightningcss-darwin-x64`, `lightningcss-freebsd-x64`, `lightningcss-linux-arm-gnueabihf`, `lightningcss-linux-arm64-gnu`, `lightningcss-linux-arm64-musl`, `lightningcss-linux-x64-gnu`, `lightningcss-linux-x64-musl`, `lightningcss-win32-arm64-msvc`, `lightningcss-win32-x64-msvc`, `lightningcss`
- **Apache-2.0** (2): `expect-type`, `typescript`
- **ISC** (2): `picocolors`, `siginfo`
- **0BSD** (1): `tslib`
- **BSD-3-Clause** (1): `source-map-js`

---

## Services (not linked dependencies)

These run as separate processes or containers (via `docker-compose.yml`) and are
not linked into Aixle Insights. Their licenses govern *your deployment*, not this
source tree — the two that carry real conditions are analysed in
[NOTICES.md](NOTICES.md).

| Service | Image / version | License | Notes |
| --- | --- | --- | --- |
| PostgreSQL + TimescaleDB | `timescale/timescaledb:latest-pg17` | PostgreSQL License; Timescale License (TSL) for community features | TSL features are required — see [NOTICES.md § 2](NOTICES.md) |
| Redis | `redis:7.2-alpine` | BSD-3-Clause | Deliberately pinned to 7.2; 7.4+ is RSALv2/SSPLv1 — see [NOTICES.md § 1](NOTICES.md) |
| Temporal | `temporalio/auto-setup:latest` | MIT | Workflow engine |
| Temporal UI | `temporalio/ui:latest` | MIT | Workflow inspection UI |
| Keycloak | `quay.io/keycloak/keycloak:latest` | Apache-2.0 | Identity provider |
| MinIO | `minio/minio:latest` | AGPL-3.0 | S3-compatible object storage in the local development stack. Used as an unmodified network service over its S3 API, so the AGPL's source-provision condition attaches to MinIO itself, not to Aixle Insights. Deployments typically point at Amazon S3 instead |
| ECS toolbox | `ghcr.io/artempartos/ecs_toolbox:latest` | not stated by the publisher | Deployment helper, third-party image, opt-in via the `remote` Compose profile. Never part of the application runtime |

## Bundled third-party assets

`packages/web/public/logos/` contains vendor logos for the coding assistants and
integrations Aixle Insights connects to (Anthropic, Claude Code, OpenAI, Cursor,
GitHub, GitLab, Bitbucket, Slack, Jira, Linear, Figma, Copilot, Windsurf, Aider,
Cody, Continue, Tabnine, Amazon Q, OpenRouter, Google). They are used
**nominatively** — to identify the tool each connector talks to in the UI — and
remain the trademarks and copyrighted works of their respective owners. They are
**not** licensed to you under Apache-2.0 by this project, and their presence
implies no affiliation with or endorsement by those vendors. If you fork and
rebrand, review each vendor's brand guidelines before reusing these files. See
[TRADEMARK.md](TRADEMARK.md#third-party-marks-in-this-repository).

## Regenerating this file

This inventory is derived from committed lockfiles, so it only changes when a
lockfile changes. To refresh it:

1. **npm packages** — every entry in `packages/web/package-lock.json` and
   `packages/tools/package-lock.json` carries `version`, `license`, and a `dev`
   flag (lockfile v3). Read them straight out of the lockfile; do not resolve
   from the registry, so the result matches what is actually installed.
2. **Gems** — `Gemfile.lock` records names and versions but not licenses. Look
   each one up at
   `https://rubygems.org/api/v2/rubygems/<name>/versions/<version>.json` and read
   the `licenses` field. Split runtime from dev/test by walking the dependency
   graph in the lock from the gems declared outside `group :development, :test`
   in the `Gemfile`.
3. Re-check the [attention table](#licenses-that-need-attention) for any new
   copyleft, source-available, or non-OSI license, and mirror anything with real
   redistribution consequences into [NOTICES.md](NOTICES.md).

Questions about licensing or redistribution: `legal.insights@aixle.com`.
