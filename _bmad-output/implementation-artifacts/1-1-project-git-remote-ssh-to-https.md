# Story 1.1: Normalize Git SSH remotes to HTTPS for project lookup

Status: done

**Completion note:** Ultimate context engine analysis completed — comprehensive developer guide created (inline epic: git remote normalization bugfix).

## Story

As a developer using an SSH git remote with the DB90 CLI,
I want the API to normalize `git@host:path` to the same canonical form as HTTPS URLs,
so that `GET /api/v1/projects/lookup` resolves the correct `project_id` for ingest attribution regardless of how the project was registered.

## Acceptance Criteria

1. `Project.normalize_git_remote("git@github.com:owner/repo.git")` returns `https://github.com/owner/repo`.
2. `Project.normalize_git_remote("https://github.com/owner/repo.git")` returns `https://github.com/owner/repo`.
3. The two inputs above normalize to the **identical** string so `GET /api/v1/projects/lookup?git_remote=` returns **200** with the same project when `git_remote_url` in the database was saved from HTTPS and the query uses the SSH remote (and vice versa after both pass through `normalize_git_remote`).
4. GitLab SCP-style remotes work the same way, e.g. `git@gitlab.com:group/project.git` → `https://gitlab.com/group/project`.
5. Existing behavior is preserved for non-SSH URLs: strip, downcase, remove trailing `.git` only (no double-processing that breaks already-HTTPS URLs).
6. Model persistence: `before_validation :normalize_git_remote_url_field` continues to delegate to `normalize_git_remote` only — **no duplicate normalization logic** elsewhere.

## Tasks / Subtasks

- [x] **Implementation** (AC: 1–6)
  - [x] Update `Project.normalize_git_remote` in `packages/api/app/models/project.rb` to detect SCP-style SSH with `\Agit@([^:]+):(.+)\z`, rewrite to `https://\1/\2`, then apply existing strip / downcase / `.git` removal.
  - [x] Add focused unit examples in `packages/api/spec/models/project_spec.rb` (new `describe ".normalize_git_remote"` block) covering GitHub + GitLab + HTTPS + `.git` suffix parity.
- [x] **Regression safety** (AC: 3)
  - [x] Run `packages/api/spec/requests/api/v1/project_lookup_spec.rb` — it already builds fixtures with `Project.normalize_git_remote(...)`; after the change, consider adding **one explicit example**: project created with **HTTPS** `git_remote_url`, lookup with **SSH** query, expect 200 (this proves the production bug is fixed; optional if time-boxed but strongly recommended).
- [x] **Verification**
  - [x] From `packages/api/`: `bundle exec rspec spec/models/project_spec.rb spec/requests/api/v1/project_lookup_spec.rb`
  - [x] `bundle exec rubocop` on touched files.

### Review Findings

- [x] [Review][Patch] The SCP branch only matched a literal lowercase `git@` before the global `downcase`: strings like `GIT@github.com:owner/repo.git` after `strip` did not match, then `downcase` left `git@...` without converting to HTTPS — canonicalization diverged from expected parity with HTTPS. Sources: blind+edge. [`packages/api/app/models/project.rb` — `normalize_git_remote`] — fixed: regex `/i`, model example `GIT@…`
- [x] [Review][Patch] The request spec only locked the cross-format "HTTPS in DB, SSH in query"; AC3 wording also calls for explicit API-level "vice versa" symmetry (HTTPS query against equivalent SSH registration / legacy DB string, if the product guarantees it). [`packages/api/spec/requests/api/v1/project_lookup_spec.rb`] — fixed: context "SSH registration → HTTPS lookup"
- [x] [Review][Defer] SCP `git@host:/path` when joined into `https://host/path` can yield a double slash `https://host//path` — rare remote format, outside current AC. [`packages/api/app/models/project.rb:normalize_git_remote`] — deferred, pre-existing
- [x] [Review][Defer] Non-standard SCP variants (explicit port `host:port:path`, IPv6) are not parsed by the current regex — potentially a separate story, not a blocker for AC1–AC6. [`packages/api/app/models/project.rb:normalize_git_remote`] — deferred, pre-existing

## Dev Notes

### Current state (what breaks)

`Project.normalize_git_remote` only strips whitespace, downcases, and removes a trailing `.git`. SCP-style SSH remotes stay as `git@host:path`, so they never equal a canonical HTTPS URL stored on the project.

```41:44:packages/api/app/models/project.rb
  def self.normalize_git_remote(url)
    return nil if url.blank?
    url.strip.downcase.delete_suffix(".git")
  end
```

Lookup uses the same helper for the query param:

```17:18:packages/api/app/controllers/api/v1/project_lookup_controller.rb
        normalized = Project.normalize_git_remote(git_remote)
        project = accessible_projects.find_by(git_remote_url: normalized)
```

**Ingest impact:** when lookup returns 404, clients do not receive `project_id` for attribution — affects developers whose local `origin` is SSH (common default).

### Required change

1. If `url` matches SCP SSH: `git@<host>:<path>` (regex `\Agit@([^:]+):(.+)\z` after strip, or apply strip first then match), rewrite to `https://<host>/<path>` (path may contain nested groups / org segments).
2. Then run **existing** normalization: `downcase`, `delete_suffix(".git")`.
3. Order matters: convert SSH → HTTPS **before** downcase/de-suffix so you do not need a separate branch for `.git` on the SSH side (both flows should end in one canonical string).

### What must be preserved

- `nil` / blank → `nil`.
- HTTPS and other non-matching strings: keep current behavior (strip, downcase, remove `.git` only).
- `before_validation :normalize_git_remote_url_field` must remain the single write-path normalizer — fix lives in `normalize_git_remote` only.

### Data / backward-compatibility note (non-blocking but important)

After this change, **new** validations will persist `git_remote_url` as HTTPS for inputs that used to persist as `git@...`. Rows **already** stored as `git@host:...` (old normalization) will **not** auto-update until the record is re-saved. Lookup from SSH will normalize to HTTPS and **may** miss those legacy rows. If product needs a backfill, that is a separate story (SQL or `find_each` touch). This story does not require a migration unless stakeholders mandate it.

### Project structure notes

- Rails model change only under `packages/api/app/models/`.
- RSpec: model specs under `packages/api/spec/models/`; request spec already exercises lookup with SSH-shaped remotes but uses the **same** normalizer for fixture URLs, so it never caught “HTTPS in DB vs SSH in query”. Add the explicit cross-format example under `spec/requests/api/v1/project_lookup_spec.rb` when possible.

### References

- [Source: `packages/api/app/models/project.rb` — `normalize_git_remote`, `normalize_git_remote_url_field`]
- [Source: `packages/api/app/controllers/api/v1/project_lookup_controller.rb` — `show`]
- [Source: `packages/api/spec/requests/api/v1/project_lookup_spec.rb` — lookup examples]
- [Source: `packages/api/spec/models/project_spec.rb` — uniqueness tests using `git_remote_url` strings]

---

## Dev Agent Guardrails

### Technical requirements

- **One method to rule them:** all canonicalization for `git_remote_url` goes through `Project.normalize_git_remote`. Do not add parallel normalization in controllers, jobs, or CLI.
- **Regex:** Use anchored SCP form `\Agit@([^:]+):(.+)\z` on the string you are normalizing (after `strip`). Capture host and path; path can include slashes (monorepo / subgroup paths).
- **Case:** Downcase the final result (or downcase after HTTPS rewrite) for stable matching.

### Architecture compliance (DB90)

- Stack: Rails 8 API, RSpec, RuboCop — follow existing style in `project.rb` (2-space indent, frozen string literal not required if file does not use it — **do not** reformat unrelated lines).
- No Swagger change for this story (behavioral fix to existing endpoint query handling, not a contract change).
- No ActionPolicy/controller surface change.

### Library / framework requirements

- Ruby stdlib only — no new gems.

### File structure requirements

| Action | Path |
|--------|------|
| UPDATE | `packages/api/app/models/project.rb` |
| UPDATE | `packages/api/spec/models/project_spec.rb` |
| OPTIONAL (recommended) | `packages/api/spec/requests/api/v1/project_lookup_spec.rb` |

### Testing requirements

- Unit tests for `normalize_git_remote` are the source of truth for edge cases (nil, empty, already HTTPS, with/without `.git`, GitHub + GitLab SSH).
- Request suite must stay green; add cross-format lookup example to lock AC3.

### Previous story intelligence

- Not applicable (no prior story file in this epic).

### Git intelligence summary

Recent commits are unrelated UI/features (`AIX-243`, `AIX-242`, `AIX-117`). No conflicting work on `Project` normalization in the last five commits.

### Latest technical information

- SCP-style `git@host:path` vs `ssh://git@host/path` — this story **only** requires the SCP form per acceptance criteria. `ssh://` URLs are out of scope unless you confirm product need (see Questions).

### Project context reference

- No `project-context.md` matched the workspace glob from BMAD persistent facts; rely on this story + linked sources.

---

## Dev Agent Record

### Agent Model Used

Cursor agent (Claude)

### Debug Log References

### Completion Notes List

- Implemented SCP-style `git@host:path` → `https://host/path` in `Project.normalize_git_remote` after `strip`, then `downcase` and `delete_suffix(".git")` unchanged for all URLs.
- Added `describe ".normalize_git_remote"` examples (nil/blank, GitHub SSH, HTTPS parity, GitLab SSH, whitespace, non-SSH HTTPS-only path).
- Added request example: project stored as canonical HTTPS, lookup with SSH query returns 200 (AC3 cross-format).
- Verification: `docker compose exec api bundle exec rspec` (full suite, 2173 examples), RuboCop clean on touched files.

### File List

- `packages/api/app/models/project.rb`
- `packages/api/spec/models/project_spec.rb`
- `packages/api/spec/requests/api/v1/project_lookup_spec.rb`

---

## Change Log

- 2026-05-22 — Story 1.1: normalize SCP SSH git remotes to HTTPS in `Project.normalize_git_remote`; model + request specs; status → review.

---

## Open questions (saved for product / follow-up)

1. Should `ssh://git@github.com/owner/repo.git` also normalize to the same HTTPS canonical form? (Not in current AC.)
2. Is a one-time data backfill required for rows where `git_remote_url` still stores the legacy `git@...` form?
