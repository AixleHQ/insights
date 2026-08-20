# Governance

This document describes how Aixle Insights is run: who decides what, how those
people are chosen, and how you can influence the project. For *how to contribute
code*, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Stewardship

Aixle Insights is an open-source project **stewarded by Dualboot Partners, LLC**
("Dualboot"). It is company-led rather than foundation-governed: day-to-day
decisions are made by the maintainer team, and Dualboot — as copyright holder of
the original work, owner of the [trademarks](TRADEMARK.md), and operator of the
hosted service — sets the overall direction and has the final say where
maintainers cannot reach agreement.

Contributions are welcome from anyone, and contributors are judged on the merit
of their work, not their affiliation.

## Roles

### Users

Anyone running Aixle Insights. Users participate by filing bug reports and
feature requests through the [issue templates](.github/ISSUE_TEMPLATE), and by
sharing how they use the project.

### Contributors

Anyone who opens a pull request. Contributing requires a
[DCO sign-off](CONTRIBUTING.md#developer-certificate-of-origin-dco) on every
commit and a signed [CLA](CLA.md) before a first change can be merged.
Contributors keep ownership of their work; the CLA grants the project the rights
it needs to distribute and, if ever necessary, relicense it.

### Maintainers

The **@AixleHQ/maintainers** team — the people with write access, listed as
owners in [`.github/CODEOWNERS`](.github/CODEOWNERS). Maintainers:

- review and merge pull requests, and are the required reviewers on every change;
- triage issues and keep the backlog honest;
- uphold the code conventions in [CONTRIBUTING.md](CONTRIBUTING.md);
- handle security reports under [SECURITY.md](SECURITY.md);
- act as the "community leaders" who enforce the
  [Code of Conduct](CODE_OF_CONDUCT.md);
- maintain the legal and compliance docs (`LICENSE`, `NOTICE`, `NOTICES.md`,
  `THIRD-PARTY-LICENSES.md`, `CLA.md`, `CLA-CORPORATE.md`, `DCO`,
  `TRADEMARK.md`, this file).

### Tech lead

One maintainer acts as tech lead and owns releases. Per the
[release runbook](docs/RELEASE.md), **only the tech lead cuts a release** —
bumping `VERSION`, merging to `main`, and pushing the tag, which is what triggers
a production deploy.

## Becoming a maintainer

Maintainers are added on the strength of sustained contribution — code, review,
triage, or documentation — over time. The path:

1. An existing maintainer nominates the candidate.
2. The maintainer team agrees (no objections within a week of the nomination).
3. Dualboot confirms, and the candidate is added to the @AixleHQ/maintainers team
   with write access.

Maintainers who have been inactive for roughly six months move to emeritus
status and lose write access; they can be reinstated by the same process,
without re-earning it from scratch.

## Decision-making

**Ordinary changes** — bug fixes, features that fit the existing design,
documentation, dependency bumps — follow lazy consensus:

- open a pull request against `main`, per [CONTRIBUTING.md](CONTRIBUTING.md);
- at least one maintainer approval is required, enforced through CODEOWNERS;
- all CI checks must pass — RSpec, RuboCop, Brakeman, Vitest, ESLint, TypeScript
  typecheck, plus the DCO and CLA checks;
- if no maintainer objects, the change merges.

**Substantial changes** — anything that alters the public API or the OpenAPI
contract, changes the data model or the ingestion pipeline, adds a new service
or a dependency under an unusual license, or affects authentication and
authorization — should start as an issue describing the problem and the intended
approach. These need **two maintainer approvals**, and the discussion stays on
the issue or PR so it is on the record.

**Legal and compliance files** — `LICENSE`, `NOTICE`, `NOTICES.md`,
`THIRD-PARTY-LICENSES.md`, `CLA.md`, `CLA-CORPORATE.md`, `DCO`, `TRADEMARK.md`,
`CODE_OF_CONDUCT.md`, and this document — additionally require Dualboot's approval, since Dualboot carries
the legal responsibility for them.

**Disagreement** is resolved by discussion among the maintainers. If that does
not converge, Dualboot decides as steward. Decisions are recorded in the issue
or PR that raised them.

## Roadmap and scope

The roadmap is set by Dualboot in consultation with the maintainers, and reflects
what the hosted product needs as well as what the community asks for. That means
a well-built pull request may still be declined if it takes the project somewhere
it is not going — so for anything substantial, **open an issue before you build
it**. Reviews happen on a best-effort basis.

## Releases

- **Application** (Rails API + web): the process, branching, and deploy triggers
  are documented in [docs/RELEASE.md](docs/RELEASE.md). The root `VERSION` file
  and [`CHANGELOG.md`](CHANGELOG.md) own the version number; releases are marked
  with annotated `vX.Y.Z` tags.
- **CLI** (`@aixle/insights`): published to npm following
  [packages/tools/RELEASING.md](packages/tools/RELEASING.md), with its own
  [changelog](packages/tools/aixle-insights/CHANGELOG.md).

`main` and `develop` are protected. Pushing `main` deploys to production, so
direct pushes happen only as part of a release, only by the tech lead.

## Security

Vulnerabilities are reported privately through GitHub's private vulnerability
reporting, never as public issues — see [SECURITY.md](SECURITY.md). Maintainers
acknowledge the report, investigate, and coordinate disclosure with the reporter.

## Code of Conduct

All participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
Maintainers are the community leaders responsible for enforcing it; reports go
through GitHub's private reporting channels and are handled confidentially.

## Licensing and intellectual property

- The source code is licensed under the [Apache License 2.0](LICENSE).
- Contributions require a [DCO](DCO) sign-off **and** a signed CLA — the
  [Individual CLA](CLA.md) for individuals, the
  [Corporate CLA](CLA-CORPORATE.md) for organizations whose employees
  contribute. The DCO certifies the origin of a contribution; the CLA grants the
  project the rights to it.
- Third-party dependency licenses are inventoried in
  [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md); the components with real
  redistribution consequences are analysed in [NOTICES.md](NOTICES.md).
- Use of the project's name and logo is governed by [TRADEMARK.md](TRADEMARK.md),
  not by the Apache License.

## Contact

| Topic | Where |
| --- | --- |
| Bugs, features, project questions | the [issue tracker](../../issues) |
| Security vulnerabilities | GitHub private vulnerability reporting, or `security.insights@aixle.com` — see [SECURITY.md](SECURITY.md) |
| Code of Conduct reports | GitHub private reporting, or `conduct.insights@aixle.com` |
| Licensing, CLA, trademark, other legal matters | `legal.insights@aixle.com` |

Those addresses are role aliases on the `insights@aixle.com` group and reach the
maintainers responsible for each area.

## Changing this document

Governance changes are proposed as pull requests, need maintainer consensus, and
are confirmed by Dualboot as steward.
