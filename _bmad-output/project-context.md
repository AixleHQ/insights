---
project_name: "db90-rails"
user_name: "Kirill"
date: "2026-05-15"
sections_completed: ["technology_stack", "language_specific_rules", "framework_specific_rules", "testing_rules", "code_quality_style_rules", "development_workflow_rules", "critical_dont_miss_rules"]
existing_patterns_found: 18
status: "complete"
rule_count: 57
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Monorepo layout: Rails API in `packages/api/`, React/Vite app in `packages/web/`, distributable tools in `packages/tools/`.
- Backend: Ruby 3.4.8, Rails ~> 8.1.2 API, PostgreSQL 17 + TimescaleDB, Redis, Sidekiq, Temporal, MinIO, Keycloak OIDC.
- Backend libraries: ActionPolicy for authorization, Alba for JSON serialization, rswag for OpenAPI/Swagger, RSpec + FactoryBot + Shoulda + WebMock + VCR for tests, RuboCop Rails Omakase for style.
- Frontend: React 19.2, TypeScript ~5.9.3 with strict compiler settings, Vite 7.2, Tailwind CSS 4.1, shadcn/ui + Radix primitives, React Router 7, TanStack Query 5.90.
- Frontend tests: Vitest 4 + React Testing Library + jsdom; Playwright is used for E2E.
- Tool packages: `@db90/sdk`, `@db90/mcp`, Cursor and Claude packages are TypeScript ESM packages under `packages/tools/`.
- Direct Ruby commands must run from `packages/api/`, where the Gemfile lives; do not run `bundle exec`, `rails runner`, or `rspec` from repo root.

## Critical Implementation Rules

### Language-Specific Rules

- TypeScript is strict: avoid `any`, satisfy `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noUncheckedSideEffectImports`.
- Use ESM imports/exports throughout frontend and tool packages; prefer the `@/*` alias for frontend source imports.
- Frontend string style is double quotes, enforced by ESLint.
- Do not use raw `fetch` or ad hoc API clients in React code. Use `packages/web/src/lib/api.ts` and hooks from `packages/web/src/hooks/useApi.ts`.
- Backend Ruby follows Rails Omakase style. Keep service/query/domain logic out of controllers when the existing layered locations fit: `app/services/`, `app/query_builders/`, `app/domain/`, `app/repositories/`.
- Rails JSON should use standard `{ data: ... }` response shapes where the surrounding controller does; validation errors should return structured errors with appropriate 4xx status.
- Alba serializers transform keys to lower camelCase via `BaseSerializer`; do not introduce ActiveModelSerializers, Blueprinter, or hand-rolled serializer frameworks.
- Preserve Rails API-only behavior. Do not add views/assets for API features.

### Framework-Specific Rules

- Every authenticated Rails API controller action must authorize with ActionPolicy. Call `authorize!` near the start of the action unless the existing controller pattern has an explicit exception.
- Any controller or route change under `packages/api` must update `packages/api/swagger/v1/swagger.yaml` in the same change. Keep path, params, request body, status codes, and response shape in sync.
- Organization-scoped API requests depend on `X-Organization-ID`; frontend requests should rely on the shared API client to attach it.
- Public/internal endpoints that skip JWT/org context must do so explicitly and provide their own authentication or routing guard, following existing ingest/internal/webhook patterns.
- Use Sidekiq for normal async jobs and Temporal only for durable, multi-step workflows that need stateful retries or orchestration.
- React server state belongs in TanStack Query hooks with stable `queryKeys`; components should consume hooks, not build request/cache logic inline.
- Prefer existing shadcn/Radix components from `packages/web/src/components/ui/` before adding custom primitives.
- UI numeric display must use `packages/web/src/lib/formatters.ts`; never inline `toFixed()`, `toLocaleString()`, or `Intl.NumberFormat` in components/pages.
- Vite proxies `/api`, `/admin`, and `/cable` to the Rails server; do not hardcode localhost API URLs in frontend code.

### Testing Rules

- Backend tests use RSpec with FactoryBot, Shoulda Matchers, WebMock/VCR, and transactional fixtures. Do not mock the database in request/integration specs.
- Put backend specs in the matching `packages/api/spec/...` area: models, policies, requests, services, jobs, serializers, middleware, or factories.
- For controller/route changes, add or update request specs and keep rswag/OpenAPI coverage aligned with `swagger.yaml` expectations.
- Policy changes need policy specs; serializer changes need serializer specs when response shape changes.
- Frontend unit/component tests use Vitest + React Testing Library + jsdom, with setup in `packages/web/src/test/setup.ts`.
- Frontend tests are either colocated with components/pages or under `packages/web/src/test/`; mirror existing `*.test.tsx` naming.
- Mock API behavior at the hook/client boundary in frontend tests. Do not bypass TanStack Query patterns when testing query-driven UI.
- Playwright E2E tests live outside the Vitest unit-test surface and are excluded from `vitest.config.ts`.

### Code Quality & Style Rules

- Follow the existing folder topology instead of creating new top-level architecture: Rails code in `app/controllers`, `app/models`, `app/services`, `app/query_builders`, `app/repositories`, `app/policies`, `app/serializers`; React code in `src/components`, `src/pages`, `src/hooks`, `src/contexts`, `src/lib`.
- Keep controllers thin: authorization, param handling, service/query calls, and rendering. Move multi-step business logic into services or existing domain layers.
- Use existing naming style: Rails files/classes follow Rails conventions; React component files are PascalCase, shadcn/ui primitive files are lowercase/kebab-style, hooks start with `use`.
- Keep comments sparse and useful. Prefer self-explanatory code; add comments only for non-obvious constraints such as caching, auth, service-worker, or compatibility behavior.
- Run relevant linters before considering work done: `make lint-api` for Rails changes, `make lint-web` for frontend changes, or the narrower package command when appropriate.
- For frontend UI, preserve the existing shadcn/Radix composition style and design tokens. Avoid one-off CSS when an existing utility/component pattern fits.
- Do not introduce new dependency families when the repo already has a chosen tool for the job, especially serializers, authorization, API fetching, routing, testing, or UI primitives.

### Development Workflow Rules

- Branch from `develop`, not `staging` or `main`. Feature branch format: `feature/AIX-XX-short-description`.
- Commit messages must be `[AIX-XX] Short imperative description`, with an imperative subject under 72 characters.
- For direct Rails commands, `cd packages/api` first. For frontend commands, run from `packages/web` unless using repo-level Make targets.
- Before a PR, run the relevant lint/test surface for changed areas: API changes need RuboCop/RSpec as appropriate; web changes need ESLint/Vitest or E2E when UI flows change.
- Multi-PR feature plans belong in `plans/<feature-slug>-<ticket>/` with `plan.md`, `orientation.md`, and task files before implementation begins.
- Each plan task should fit one implementation session and one PR unless deliberately split into suffix subtasks such as `02a-*`.
- Worktree-specific rule: do not run `bundle install` or `npm install` in worktrees because dependencies are symlinked from the main repo.
- Before opening a PR, verify GitHub auth with `gh auth status`; if unavailable, report that instead of pretending PR automation succeeded.

### Critical Don't-Miss Rules

- Never change Rails routes/controllers without checking Swagger impact. Swagger drift is a hard failure for this project.
- Never add an authenticated controller action without ActionPolicy authorization, even if the route seems internal to the app.
- Never bypass the shared frontend API client; doing so drops auth renewal, impersonation handling, and organization headers.
- Never inline money/token/percentage formatting in UI. Add or use a named formatter in `packages/web/src/lib/formatters.ts`.
- Never assume organization context from URL alone. Backend authorization and frontend API calls often depend on `X-Organization-ID`.
- Never drop a database column in the same migration that removes app usage. Use a two-step deploy path.
- Never put long-running, retry-sensitive orchestration into a plain controller or synchronous service when it belongs in Sidekiq or Temporal.
- Never introduce a new serializer/auth/API-fetching/UI/test framework without an explicit architectural decision.
- For public ingest, webhook, MCP, and internal endpoints, treat authentication, token validation, and replay/routing boundaries as first-class implementation requirements.
- For large exports, time-series queries, dashboard stats, and connector syncs, check existing query builders/services before adding naive ActiveRecord loops.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing code in this repository.
- Follow all rules as documented; when uncertain, choose the stricter project convention.
- Prefer existing patterns and local helpers over new abstractions.
- Update this file when durable project patterns or stack choices change.

**For Humans:**

- Keep this file lean and focused on rules agents are likely to miss.
- Update it when the stack, architecture, or workflow changes.
- Remove rules that become obvious or obsolete.
- Review periodically for accuracy and context efficiency.

Last Updated: 2026-05-15
