# Contributing to Aixle Insights

Thanks for your interest in contributing! Aixle Insights is an AI tool analytics
platform (Rails API + React web + a published `@aixle/insights` CLI/MCP package).
This guide covers how to get set up, our conventions, and how to submit changes.

## Getting started

1. Fork the repository and clone your fork.
2. Install prerequisites: **Ruby** 3.4.8 and **Node.js** 24.13.0 (see `.tool-versions`, [asdf](https://asdf-vm.com) recommended), Docker, and Bundler.
3. Start the stack:

```bash
make up          # start Docker services (Postgres/Timescale, Redis, Keycloak, MinIO, Temporal)
make api         # Rails API on :3000
make web         # Vite dev server on :5173
```

4. Run the test suites before you start changing things, so you know your baseline is green:

```bash
make test        # RSpec + Vitest
make lint        # RuboCop + ESLint
```

See [README.md](README.md) for the full architecture overview and environment setup.

## Branching

Branch from `main`. Use a descriptive prefix:

- `feature/` — new functionality
- `bugfix/` / `fix/` — bug fixes
- `chore/`, `docs/`, `refactor/`, `test/` — everything else

Example: `feature/slack-alerts`, `bugfix/n-plus-one-usage-report`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): short imperative description
```

- Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.
- Scope is optional but encouraged (e.g. `api`, `web`, `aixle-insights`).
- Keep the subject under 72 characters, imperative mood ("Add", not "Added").

Example: `feat(api): add connector health display`.

## Code conventions

**Ruby / Rails**
- RuboCop (`rubocop-rails-omakase`). Run `bundle exec rubocop --parallel` before committing.
- RSpec + FactoryBot for tests. Don't mock the database in request/integration specs.
- Serializers use [Alba](https://github.com/okuramasafumi/alba); authorization uses [ActionPolicy](https://actionpolicy.evilmartians.io/).
- Whenever you add or change a controller action or route, update `packages/api/swagger/v1/swagger.yaml` in the same commit.

**TypeScript / React**
- TypeScript strict mode — avoid `any`.
- Component library: shadcn/ui (Radix). Prefer existing components.
- Data fetching: TanStack Query (no raw `fetch`/`axios` in components).
- All numeric display goes through `packages/web/src/lib/formatters.ts`.

## Pull requests

1. Make sure `make lint` and `make test` pass locally.
2. Push your branch and open a PR against `main`.
3. Fill out the PR template — describe the change and how you verified it.
4. CI runs RSpec, RuboCop, Brakeman, Vitest, ESLint, and TypeScript typecheck, plus the DCO and CLA checks.

We review PRs on a best-effort basis. Thanks for helping improve Aixle Insights!

## Reporting security issues

Please do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md).

## Developer Certificate of Origin (DCO)

Every commit must carry a `Signed-off-by:` trailer certifying you have the right
to submit the code under the project's license (see
[developercertificate.org](https://developercertificate.org/)). Our DCO check
verifies this on every pull request.

`make setup` (or `make hooks`) points git at `.githooks/`, which appends the
sign-off automatically — so a plain `git commit` behaves like `git commit -s`.
If you commit without the hook, add the trailer yourself:

```bash
git commit -s -m "feat(api): add connector health display"
```

To fix commits that are missing the sign-off:

```bash
git commit --amend -s --no-edit          # most recent commit
git rebase --signoff origin/main         # every commit on the branch
```

The sign-off email must match the commit author's email.

## Contributor License Agreement

Contributions to Aixle Insights also require a signed **Contributor License
Agreement (CLA)** (this is separate from, and in addition to, the DCO sign-off).
Before your first contribution can be merged, you must sign it; the CLA Assistant
bot comments on your first pull request with the one-time signing step, and the
signature covers all your future contributions.

The CLA grants the maintainers the rights needed to distribute, sublicense, and —
if ever necessary — relicense the project, which a DCO sign-off alone does not
provide. You keep full ownership of your contributions either way.

- Contributing on your own behalf → the [Individual CLA](CLA.md#individual-cla)
- Contributing on behalf of an employer or other organization → your organization
  executes the [Corporate CLA](CLA.md#corporate-cla); see its § 7 for how the two
  interact, and note that its Schedule A is an administrative convenience, not a
  condition of the license grant

> The DCO certifies the **origin** of your contribution; the CLA grants the
> project the **rights** to it. Both are required.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE), subject to the terms of the signed
[CLA](CLA.md).
