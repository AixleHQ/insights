# Changelog

All notable changes to DB90 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.1] - 2026-06-29

First tagged release. Scope is intentionally narrow: this alpha validates the
production infrastructure (image build, DB migrations, secrets/ENV wiring,
service boot, deploy pipeline, Rollbar) ahead of the full 1.0.0. Feature content
continues to land on `develop` and ships in subsequent `1.0.0-alpha.*` / `-rc.*`
tags cut from the same `release/1.0.0` branch.

### Added
- Initial DB90 platform release cut from `develop` for production infrastructure validation.

[1.0.0-alpha.1]: https://github.com/dualboot-partners/db90-rails/releases/tag/v1.0.0-alpha.1
