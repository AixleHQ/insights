# `docs/data-pipeline/` — Aixle Insights ingestion-surface documentation

Canonical home for documentation about **what data the Aixle Insights CLI connectors capture from AI coding assistants**, what the vendors expose, and what gaps exist between the two.

## Reading order

1. **[TOKENS.md](TOKENS.md)** — baseline reference (May 2026). Authoritative map of the `tool_events.event_type` enum, what each CLI emits today, and a first-pass inventory of available-but-uncaptured signal. Start here.
2. **[DATA-CURRENT.md](DATA-CURRENT.md)** — validated view of what we capture today, with code-level traceability (mapper.ts and claude-reader.ts → tool_events columns), and the **proposed sub-task backlog** for closing gaps. Cursor + Claude sections; ends with a cross-tool summary table.
3. **[DATA-CURSOR.md](DATA-CURSOR.md)** — full Cursor vendor surface: tab completion, Composer, Chat, background agents, BugBot, MCP, settings. Mermaid flow + ER diagrams, granularity knobs, JSON payload examples, hidden-flag research trail.
4. **[DATA-CLAUDE.md](DATA-CLAUDE.md)** — full Claude Code vendor surface: chat turns, tool_use blocks, thinking blocks, session lifecycle, hooks, slash commands, sub-agents, usage block. Mermaid lifecycle + ER diagrams, JSON payload examples.

## Scope

This folder documents the **ingestion surface only** — what data is available, what we capture, what we don't, why, and what it would take to capture more. It is **not** the place for:

- Rails schema docs (those live in `packages/api/db/`).
- CLI extractor implementation notes (those live in `packages/tools/db90-{cursor,claude}/README.md`).
- Sanitization-policy spec (`packages/api/db/seeds.rb` + future `docs/sanitization-policy.md`).
- Dashboard / UI contracts (those live in `packages/web/` component READMEs).

When adding a new connector (Windsurf, Copilot, …), add a sibling `DATA-<VENDOR>.md` here and update the cross-tool summary table in `DATA-CURRENT.md`.

## Provenance

These docs are produced by the **AIX-136 epic**. Child tickets:

- AIX-233 — Document available data from Cursor → `DATA-CURSOR.md`
- AIX-234 — Document available data from Claude Code → `DATA-CLAUDE.md`
- AIX-235 — `[CURSOR]` Review data being sent by @db90 tools → `DATA-CURRENT.md` (cursor section)
- AIX-236 — `[CLAUDE]` Review data being sent by @db90 tools → `DATA-CURRENT.md` (claude section + cross-tool)
