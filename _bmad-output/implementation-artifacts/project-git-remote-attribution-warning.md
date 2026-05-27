# Story: Project git remote attribution warning

Status: done

**Completion note:** Ultimate context engine analysis completed - comprehensive developer guide created.

## Story

As a DB90 admin,
I want projects without a configured git remote URL to be clearly marked in project detail, settings, and grid views,
so that I can fix unlinked projects before CLI events remain permanently unattributed.

## Acceptance Criteria

1. When a project's `git_remote_url` is `null`, `undefined`, or blank after trimming, `ProjectDetail` shows a visible inline warning explaining that CLI events will not be automatically attributed and includes a direct link to that project's settings page.
2. The same missing-git-remote warning is visible on the general project settings screen so admins understand why attribution is missing at the place where they can fix it.
3. `ProjectCard` shows a small amber unlinked indicator for projects without a git remote. Tooltip copy: `No git remote configured — CLI events won't be attributed.`
4. The create/edit project form labels the field as `Git remote URL (for auto CLI attribution)` and the help text explains that admins should paste the output of `git remote get-url origin` and that CLI events will be auto-attributed when the CLI runs inside that repository.
5. The warning/indicator disappears after a git remote is saved and the updated project data is re-rendered.
6. No API, query, or routing changes are introduced; the UI uses fields already present on the `Project`/`ProjectWithStats` payloads.

## Tasks / Subtasks

- [x] Add a reusable "missing git remote" check in the touched UI surfaces (AC: 1, 2, 3, 5)
  - [x] Treat both camelCase and snake_case payloads as valid sources: `project.gitRemoteUrl ?? project.git_remote_url`.
  - [x] Treat whitespace-only strings as missing, not just `null`.
- [x] Add warning banner to project detail overview and settings (AC: 1, 2, 5)
  - [x] Update `packages/web/src/pages/ProjectDetail.tsx` to render an inline warning near the top of the page, before the main content gets buried by stats/tabs.
  - [x] Update `packages/web/src/pages/ProjectSettings.tsx` general settings view to show the same warning above or near the editable git remote field.
  - [x] Use the existing project settings route `/projects/:id/settings` for the CTA link.
- [x] Add unlinked indicator to project cards (AC: 3, 5)
  - [x] Extend `packages/web/src/components/projects/ProjectCard.tsx` `ProjectData` with git-remote information needed for rendering.
  - [x] Update `packages/web/src/pages/Projects.tsx` mapping from `useProjects` so cards actually receive that field.
  - [x] Reuse existing design-system primitives for the amber badge/tooltip treatment instead of inventing custom tooltip markup.
- [x] Improve git remote field messaging in project forms (AC: 4)
  - [x] Update `packages/web/src/components/projects/ProjectForm.tsx` label/help text.
  - [x] Keep `packages/web/src/pages/ProjectSettings.tsx` field copy aligned with the form component even though that screen currently duplicates the field instead of reusing `ProjectForm`.
- [x] Add or update frontend tests (AC: 1, 2, 3, 5)
  - [x] Extend `packages/web/src/pages/ProjectDetail.test.tsx` with a missing-git-remote case.
  - [x] Extend `packages/web/src/pages/ProjectSettings.test.tsx` with a missing-git-remote case.
  - [x] Add a focused test for `ProjectCard` if none exists yet, or cover the indicator through an existing projects-page test surface if that is the lighter fit.

## Dev Notes

### Business context

- This is a follow-up UX gap around AIX-245 and related project attribution work.
- A project without `git_remote_url` will fail the CLI lookup path and will never receive automatic project attribution from CLI events.
- Without a visible UI signal, the project can sit at `0` events / `0` cost indefinitely with no explanation for admins.

### Current state of the affected files

- `packages/web/src/pages/ProjectDetail.tsx`
  - Already loads `useProject(id)` and renders the project header before tabs and overview cards.
  - Existing warning pattern already uses `Alert` + `AlertDescription`.
  - The safest placement is near the top-level page content so the warning is visible regardless of active tab.
- `packages/web/src/pages/ProjectSettings.tsx`
  - Maintains its own general settings form and does not reuse `ProjectForm`.
  - Already exposes `git_remote_url` in local form state and is therefore the natural place for the remediation banner and matching field copy.
  - Preserve existing save/delete flows and `hasChanges` behavior.
- `packages/web/src/components/projects/ProjectCard.tsx`
  - Current `ProjectData` omits git-remote fields entirely, so the card cannot implement the new indicator without a type/mapping change.
  - The card already uses badges, dropdown actions, and subtle hover behavior; the new indicator should fit that existing density rather than re-layouting the card.
- `packages/web/src/pages/Projects.tsx`
  - Transforms `ProjectWithStats` from `useProjects` into the `ProjectData` shape.
  - Must be updated to forward `gitRemoteUrl`/`git_remote_url`, otherwise `ProjectCard` will silently never show the new state.
- `packages/web/src/components/projects/ProjectForm.tsx`
  - Already has the git remote field plus help text mentioning Claude/Cursor detection.
  - This story refines wording, not validation or submission behavior.
- `packages/web/src/lib/types.ts`
  - `Project` already includes both `git_remote_url` and `gitRemoteUrl`.
  - Do not remove or rename those fields; only confirm they continue to match the server response shape.

### Architecture compliance

- Frontend stack is React 19.2 + React Router 7.13 + TanStack Query 5.90 + Tailwind 4.1 + shadcn/Radix primitives.
- Use existing UI primitives from `packages/web/src/components/ui/`:
  - `Alert` / `AlertDescription` for the inline warning.
  - `Badge` plus `Tooltip` primitives for the card indicator.
- Do not introduce new API calls, new client helpers, or ad hoc fetch logic. Existing `useProject` / `useProjects` data is sufficient.
- Keep string style as double quotes and respect strict TypeScript settings.

### UI guidance

- Match the existing warning tone used elsewhere in the app, especially the amber warning treatments in:
  - `packages/web/src/components/ui/CliStatusBadge.tsx`
  - `packages/web/src/pages/UnattributedEvents.tsx`
- Prefer a concise admin-facing explanation over a long paragraph.
- The detail/settings warning should include a direct CTA link to settings, using router navigation instead of hardcoded external anchors.
- The project-card indicator should be small and secondary to the project name/status badge, not a dominant banner.

### Likely implementation pattern

- Derive a boolean once per surface, for example:
  - `const gitRemoteUrl = project.gitRemoteUrl ?? project.git_remote_url ?? "";`
  - `const isGitRemoteMissing = gitRemoteUrl.trim().length === 0;`
- Reuse that derived state in conditional rendering instead of repeating null/empty checks inline.
- Keep the route target consistent:
  - Detail page CTA: `/projects/${id}/settings`
  - Card tooltip is informational only; no requirement to make the badge itself navigable.

### Testing requirements

- Frontend tests use Vitest + React Testing Library.
- Existing relevant tests:
  - `packages/web/src/pages/ProjectDetail.test.tsx`
  - `packages/web/src/pages/ProjectSettings.test.tsx`
- Test for both presence and absence:
  - Warning visible when git remote is missing.
  - Warning absent when git remote is populated.
  - Card indicator/tooltip present only for unlinked projects.
- If adding a new `ProjectCard` test file is the cleanest option, colocate it with the component using `*.test.tsx`.

### File structure

| Action | Path |
|--------|------|
| UPDATE | `packages/web/src/pages/ProjectDetail.tsx` |
| UPDATE | `packages/web/src/pages/ProjectSettings.tsx` |
| UPDATE | `packages/web/src/components/projects/ProjectCard.tsx` |
| UPDATE | `packages/web/src/pages/Projects.tsx` |
| UPDATE | `packages/web/src/components/projects/ProjectForm.tsx` |
| VERIFY / KEEP IN SYNC | `packages/web/src/lib/types.ts` |
| UPDATE | `packages/web/src/pages/ProjectDetail.test.tsx` |
| UPDATE | `packages/web/src/pages/ProjectSettings.test.tsx` |
| OPTIONAL NEW TEST | `packages/web/src/components/projects/ProjectCard.test.tsx` |

### Previous story intelligence

- `_bmad-output/implementation-artifacts/aix-245-backfill-project-attribution.md`
  - Historical events can now be backfilled conservatively, but forward-looking UI still needs to explain when attribution can never happen automatically.
- `_bmad-output/implementation-artifacts/1-1-project-git-remote-ssh-to-https.md`
  - Git remote normalization already exists; this story should not revisit normalization logic or add new client-side normalization behavior.
  - The real problem here is absence of the value, not format mismatch.

### Git intelligence summary

- Recent commits are BMAD/tooling and prompt-insights work, not competing changes in project pages.
- No evidence of an in-flight redesign for project detail/settings, so this story should preserve the current layout and layer the warnings into it.

### Latest tech information

- No external library research is required for this story beyond the repo-pinned stack because the work stays inside existing local primitives and route/query patterns.
- Relevant pinned versions from `packages/web/package.json`:
  - `react` / `react-dom`: `^19.2.0`
  - `react-router-dom`: `^7.13.0`
  - `@tanstack/react-query`: `^5.90.20`
  - `@radix-ui/react-tooltip`: `^1.2.8`

### Project context reference

- Follow `_bmad-output/project-context.md`:
  - use existing hooks and shared API client only
  - preserve shadcn/Radix patterns
  - add frontend tests for UI behavior changes
  - avoid introducing new formatting helpers or dependency families

### References

- [Source: `packages/web/src/pages/ProjectDetail.tsx`]
- [Source: `packages/web/src/pages/ProjectSettings.tsx`]
- [Source: `packages/web/src/components/projects/ProjectCard.tsx`]
- [Source: `packages/web/src/pages/Projects.tsx`]
- [Source: `packages/web/src/components/projects/ProjectForm.tsx`]
- [Source: `packages/web/src/lib/types.ts`]
- [Source: `packages/web/src/components/ui/CliStatusBadge.tsx`]
- [Source: `packages/web/src/pages/UnattributedEvents.tsx`]
- [Source: `packages/web/src/pages/ProjectDetail.test.tsx`]
- [Source: `packages/web/src/pages/ProjectSettings.test.tsx`]
- [Source: `_bmad-output/implementation-artifacts/aix-245-backfill-project-attribution.md`]
- [Source: `_bmad-output/implementation-artifacts/1-1-project-git-remote-ssh-to-https.md`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `packages/web/package.json`]

## Dev Agent Record

### Agent Model Used

Composer (implementation session)

### Debug Log References

- `resolve_customization.py` could not run because local `python3` is older than 3.11, so workflow customization was resolved manually from `.agents/skills/bmad-create-story/customize.toml`.
- No `sprint-status.yaml`, PRD, architecture, UX, or epic artifacts were present under `_bmad-output/planning-artifacts`, so this story was derived from the user-provided requirement plus repository source analysis.

### Completion Notes List

- Created a standalone ready-for-dev story artifact for the git-remote attribution warning UX gap.
- Expanded the real implementation scope beyond the initial file list to include `ProjectSettings.tsx`, `Projects.tsx`, and frontend tests so the dev agent does not miss required wiring.
- Confirmed `packages/web/src/lib/types.ts` already includes `git_remote_url`; the card/grid gap is local component typing and mapping, not API typing.
- Implemented `getProjectGitRemoteUrl` / `isGitRemoteMissing` in `packages/web/src/lib/project-git-remote.ts` and wired amber `Alert` on `ProjectDetail` (with router `Link` to settings), settings general form (banner + aligned labels/help), `ProjectCard` amber "Unlinked" badge + Radix tooltip (AC copy), `Projects` list mapping for both key casings, and `ProjectForm` label/help updates.
- Added `ResizeObserver` stub in `packages/web/src/test/setup.ts` so Radix tooltip tests run in jsdom without errors.
- All `packages/web` Vitest tests pass (`npx vitest run`, 604 tests).
- `useUpdateProject` now also invalidates the org projects list (`queryKeys.projects.all(orgId)`) when org id is known from cached project detail, so the grid “Unlinked” badge clears after saving a git remote without a full page reload.

### Change Log

- 2026-05-27 — Implemented git-remote missing UX (detail alert, settings banner, card indicator, form copy), shared `project-git-remote` helpers, tests, jsdom `ResizeObserver` polyfill for Radix, and `useUpdateProject` cache invalidation for org project lists when org id is available from cached project detail.

### File List

- `_bmad-output/implementation-artifacts/project-git-remote-attribution-warning.md`
- `packages/web/src/lib/project-git-remote.ts`
- `packages/web/src/pages/ProjectDetail.tsx`
- `packages/web/src/pages/ProjectSettings.tsx`
- `packages/web/src/components/projects/ProjectCard.tsx`
- `packages/web/src/pages/Projects.tsx`
- `packages/web/src/components/projects/ProjectForm.tsx`
- `packages/web/src/pages/ProjectDetail.test.tsx`
- `packages/web/src/pages/ProjectSettings.test.tsx`
- `packages/web/src/components/projects/ProjectCard.test.tsx`
- `packages/web/src/hooks/useApi.ts`

## Open questions

1. The requirement text says `ProjectDetail / ProjectSettings`, but the initial "Files to change" list omitted `packages/web/src/pages/ProjectSettings.tsx`. This story assumes the settings-page warning is in scope and should be implemented there.
