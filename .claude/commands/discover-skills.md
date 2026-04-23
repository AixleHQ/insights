---
description: Scan the project stack, query skills.sh for relevant skills, evaluate each candidate for context safety, then install or convert as appropriate — without bloating the context window.
argument-hint: "[optional focus keyword: 'rails', 'react', 'figma', 'testing', etc.]"
allowed-tools: Bash(npx skills*), Bash(npx skills find*), Bash(npx skills add*), Bash(npx skills list*), Read, Write, Edit, Glob, WebFetch, Agent
---

## Your task

Discover and install skills from skills.sh that fit this project. Every step runs from what you find in the repo — no hardcoded assumptions. Work through the steps in order.

---

### Step 0 — Profile the project from source

Read the following files to build a complete tech-layer map. Do not print them — extract and store the info mentally.

**Always read:**
- `CLAUDE.md` (if present) — conventions and mandated libraries
- `AGENTS.md` (if present) — existing tooling already in place
- `.claude/skills/` — currently installed skills (avoid duplicating)

**Detect package managers and manifests:**
```
Glob: **/Gemfile (exclude vendor/, node_modules/)
Glob: **/package.json (exclude node_modules/, dist/)
Glob: **/Cargo.toml
Glob: **/pyproject.toml or **/requirements.txt
Glob: **/go.mod
```
Read each manifest found. Extract: language/runtime versions, key frameworks, key libraries, test frameworks, linters, database drivers, auth libraries, background job systems.

**Detect project shape:**
```
Glob: packages/*/  or apps/*/  (monorepo?)
Glob: **/*.rb      (Rails? Sinatra? Plain Ruby?)
Glob: **/*.ts      (TypeScript?)
Glob: **/Dockerfile or docker-compose.yml
```

Build a per-package table internally:
```
Package | Runtime | Framework | Test lib | Key deps | Integrations
```

**Detect what's already covered:** read every file in `.claude/skills/` and note what each one handles.

If the user passed a filter argument, narrow all subsequent searches to the matching layer.

---

### Step 1 — Derive search queries from the profile

Do NOT use a hardcoded query list. Build queries from what you found:

- One query per major framework discovered (e.g. `rails`, `react`, `django`)
- One query per test library discovered (e.g. `rspec`, `pytest`, `vitest`)
- One query per significant integration (e.g. `figma`, `stripe`, `postgresql`)
- One query per architectural pattern that appears heavily (e.g. `sidekiq`, `tanstack query`, `graphql`)
- One query for each language/runtime beyond the main one (e.g. `typescript node cli` if a Node CLI sub-package was found)

Run all queries in parallel:
```bash
npx skills find <query> 2>&1
```

Each result line format: `owner/repo@skill-name  X installs` (ANSI color codes present — extract text).

Collect top 5 per query. De-duplicate across queries.

**Auto-disqualify before evaluation:**
- Install count < 100 unless from an official org (framework owner, platform vendor, vercel-labs, anthropics)
- Skill explicitly advises against a library this project actively uses (e.g. "avoid RSpec" when the project uses RSpec)
- Skill targets a major version incompatible with what the project uses (e.g. Tailwind v3 skills in a v4 project — check `package.json` for the actual version)

---

### Step 2 — Evaluate each candidate

For each candidate that survived auto-disqualify, fetch its page:
```
https://skills.sh/<owner>/<repo>/<skill-name>
```

Run fetches in parallel where possible.

Evaluate each against **three gates** — must pass all three:

#### Gate A — Context safety (token estimate)
Count the SKILL.md body length:
- **Green** (< 300 tokens): safe as ambient skill
- **Yellow** (300–600 tokens): ambient only if clearly scoped; otherwise convert to command
- **Red** (> 600 tokens): never ambient — convert to command, or skip if it also fails Gate C

#### Gate B — Trigger scope
Does this skill have conditions for when it loads (file patterns, explicit invocation, specific event), or is it always-on?
- **Scoped** → safe as ambient
- **Always-on** → convert to command (on-demand via `/skill-name`)

#### Gate C — Additive value
Does it cover something NOT already in:
- The existing `.claude/skills/` files
- `CLAUDE.md` (already enforced by the team)
- `AGENTS.md`

If it's a strict subset of existing coverage: skip.

Record your verdict table:
```
| Skill | Gate A | Gate B | Gate C | Verdict | Action |
```

---

### Step 3 — Advisor review

Before presenting anything to the user, spawn an Opus advisor to review the verdict table:

```
Agent (model=opus):

You are an Opus advisor reviewing a proposed skill install list for a software project.

Project profile:
<paste the per-package table from Step 0>

Already covered by local tooling:
<list of .claude/skills/ files and what they handle>

Proposed candidates and verdicts:
<paste the Gate A/B/C verdict table>

For each candidate:
1. Confirm or override the Gate verdict. Explain any override.
2. Flag stack conflicts not caught by the gates (wrong version assumptions, library contradictions, opinionated style that contradicts the project's existing conventions).
3. Flag any missing skill category that you'd expect given the profile but wasn't found — note it as a gap, not a hallucination.

Return: final approved list (installs + conversions), overrides with reasons, gaps noted.
```

Incorporate the advisor's overrides into the verdict table.

---

### Step 4 — User confirmation

Present the full verdict table to the user:

```
## Proposed skill changes

### Install as ambient skills
| Skill | Source | Installs | Token est. | Why useful |
|---|---|---|---|---|
...

### Convert to on-demand commands
| Command | Source | Why not ambient |
|---|---|---|
...

### Skip
| Skill | Reason |
|---|---|
...

Proceed with these changes? (yes / no / edit the list)
```

**Stop here and wait for the user's response.** Do not install anything until the user confirms.

If the user edits the list (e.g. "skip X, add Y"), adjust and confirm once more before proceeding.

---

### Step 5 — Install and convert

For each item the user approved:

#### Ambient install
```bash
npx skills add <owner/repo> --agent claude-code --skill <skill-name> -y
```

#### Convert to command
1. Fetch the full SKILL.md content from `https://skills.sh/<owner>/<repo>/<skill-name>`.
2. Write to `.claude/commands/<skill-name>.md` with frontmatter added if missing:
   ```yaml
   ---
   description: <one-line description>
   ---
   ```
3. Do not overwrite an existing file — skip and note it.

---

### Step 6 — Post-install patch

After installs complete:
```bash
npx skills list --agent claude-code --json 2>&1
```

For each newly installed skill in `.claude/skills/`, read its SKILL.md. If the frontmatter lacks a `description` field, infer one from the content and add it — Claude Code uses this field to decide when to surface the skill contextually.

---

### Step 7 — Summary

```
## Skill discovery complete

### Installed (ambient — auto-loads on matching context)
| Skill | Source | Token est. |
|---|---|---|
...

### Added as commands (on-demand — invoke with /name)
| Command | Source |
|---|---|
...

### Skipped
| Skill | Reason |
|---|---|
...

### Context budget
Before: X ambient skills (~Y tokens/session)
After:  A ambient skills (~B tokens/session)
Delta:  +Z tokens/session
```

End with: *"Run `/help-tooling` to see the updated catalog."*

---

### Hard rules

- Never skip Step 4. Always wait for user confirmation before installing.
- Never install globally (`-g`). Project scope only.
- Never install always-on + > 300 tokens — convert instead.
- Never overwrite an existing `.claude/commands/` file.
- Always pass `-y` to `npx skills add`.
- Do not hallucinate skills. If a search returns nothing relevant, say so.
- The advisor step (Step 3) is required. If the Agent tool is unavailable, present candidates with a note that advisor review was skipped and ask the user to review carefully.
