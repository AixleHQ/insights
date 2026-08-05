---
description: Show a live catalog of available Claude tooling (commands, agents, skills, hooks) with when to use each
argument-hint: "[optional filter: 'backend', 'frontend', 'design system', 'review', etc.]"
---

## Your task

Produce a friendly, up-to-date catalog of the Claude tooling available in this repo, reading it directly from the filesystem so it never drifts.

### Steps

1. Read every file in `.claude/commands/`, `.claude/agents/`, and `.claude/skills/*/SKILL.md`.
2. For each primitive, extract:
   - Name (filename minus `.md`, or folder name for skills)
   - One-line description from frontmatter
   - Role (command / agent / skill / hook)
3. Read `.claude/settings.json` and list any configured hooks.
4. If the user provided a filter argument, only include primitives whose name or description matches it (case-insensitive).
5. Present the catalog in this shape:

```
# Claude Tooling — Aixle Insights

## Commands (you invoke with /name)
| Command | When to use |
| --- | --- |
...

## Agents (model spawns via Task tool)
| Agent | Role | When it activates |
| --- | --- | --- |
...

## Skills (auto-triggered on file edits)
| Skill | Triggers on | What it injects |
| --- | --- | --- |
...

## Hooks (harness runs silently)
| Hook | Event | Effect |
| --- | --- | --- |
...

## Suggested flows for common goals
- Add a new API endpoint: swagger-sync + actionpolicy-check + /review-commit
- Migrate a component: /migrate-component
- Debug a bug: /debug-issue
- Pre-PR: /review-architecture + /review-commit
```

6. End with: *"For deep detail on any of these, just ask — e.g. 'how does swagger-auditor work?' — and the primitive will explain itself."*

### Rules

- Keep the output compact. One line per primitive in the table.
- Do NOT hallucinate primitives that don't exist in the filesystem.
- If a directory is empty, omit its section rather than printing an empty table.
- If the filter matches nothing, say so clearly and suggest running `/help-tooling` with no argument to see everything.
