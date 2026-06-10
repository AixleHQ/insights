---
name: aixle-reset
description: Reset local @aixle/insights env to a known-good state — rebuilds dist, stops/restarts MCP from a git-rooted cwd, repairs ~/.claude.json + ~/.cursor/mcp.json, warns on stale state. Invoke after editing packages/tools/aixle-insights/** or when telemetry seems to be ignoring code changes.
---

# aixle-reset

You've edited the `@aixle/insights` package or you suspect your local MCP env has drifted. This skill resets it deterministically — no more guessing whether you're running the latest build, whether your MCP config is correct, or whether a stale process is shadowing your changes.

## When to invoke

- After **any edit under `packages/tools/aixle-insights/**`** (especially `src/`, `package.json`, or `dist/`).
- When **events show `Project: -`** in the dashboard and you expect them to be attributed.
- When you've **switched branches** within the aixle-insights migration work and the running MCP doesn't reflect the branch's code.
- When **manual `kill PID` / `nohup node …` rituals** are creeping back into your shell history.

You do **not** need to invoke this when:
- You only edited `packages/tools/aixle-insights/test/**` (tests don't change what the running MCP does).
- You only edited docs (`README.md`, `CHANGELOG.md`).

## What it does

Runs `packages/tools/aixle-insights/scripts/reset-local-env.mjs`. In order:

1. Finds the repo root via `git rev-parse --show-toplevel` (no hardcoded paths).
2. Stops any running `aixle-insights/dist/cli.js run` processes.
3. Rebuilds the dist **only if** something in `src/` is newer than `dist/`.
4. Repairs `~/.claude.json`:
   - Sets `mcpServers["aixle-insights"]` to `node <abs path>/dist/cli.js run` (so it never depends on `npx -y @aixle/insights` resolving — useful until npm publish is fully live).
   - Removes any duplicate `mcpServers.insights` or legacy `mcpServers.db90`.
5. Repairs `~/.cursor/mcp.json` (if present) the same way (Cursor convention: key `insights`).
6. Restarts the MCP from the repo root (so `process.cwd()` is git-rooted and pre-resolution can find the project).
7. Waits up to 30s for the first `project_attribution_resolved` log line and asserts `project_id` is non-null.

Backups of any modified config files are saved next to the original with a timestamp suffix (`.bak-reset-YYYY-MM-DDTHH-MM-SS-…Z`).

## Warnings the script may surface (non-blocking)

- **Direct curl ingest hooks in `~/.claude/settings.json`** (`PostToolUse` / `Stop` POST-ing to `/ingest/events`). These bypass the MCP and post events without `project_id`. Consider removing them — the MCP handles ingest with attribution now.
- **Stale globally installed `@db90/*` packages** (`@db90/claude`, `@db90/cursor`, `@db90/sdk`). Pre-rename leftovers. The script prints the exact `npm uninstall -g …` command.

These are user-state issues the script flags but does not silently change.

## How to run

```bash
node packages/tools/aixle-insights/scripts/reset-local-env.mjs
```

Or invoke this skill as `/aixle-reset` from Claude Code.

## After it runs

The skill restarts the MCP, but **your active Claude Code and Cursor sessions still hold the OLD MCP handle**. To pick up the new MCP:

1. Quit Claude Code and/or Cursor.
2. Reopen them in the `db90-rails` workspace (so each IDE spawns its own MCP from the repaired config).
3. Optionally kill the manual MCP the script started — each IDE will have its own now.

If you skip the IDE restart, the script's MCP keeps running standalone and will still sweep your transcripts (correctly), but new MCP tool calls from your IDEs won't reach it.

## When the script reports `project_id: null`

The git remote of the directory you're running from isn't registered as a project on the dashboard. Either:
- Your `cwd` isn't a git repo (`git rev-parse` would have failed earlier, so this is unlikely).
- The remote is registered but under a different name — check `/projects` on the dashboard.
- You're on a worktree whose remote got rewritten — `git remote get-url origin` and confirm.

The per-turn `cwd` fallback (commit `f50adf7`) means individual session turns will still resolve correctly even if pre-resolution returns null. But the warning is a useful early signal.

## Tutor mode

If a teammate asks "how does aixle-reset work?" or "when does this trigger?":
- Trigger: manual via `/aixle-reset`, OR auto-suggested by the `.claude/hooks/on-aixle-insights-edit.ts` PostToolUse hook when you edit files under `packages/tools/aixle-insights/**`.
- The hook **suggests** running the reset; it does not auto-execute, to avoid disrupting active edit loops.
- The worker is a Node ESM script (cross-platform-ish — macOS and Linux today; Windows process-kill is a followup).
- All file edits are backed up; revert via the `.bak-reset-*` siblings if needed.
- Cap: ~250 words.
