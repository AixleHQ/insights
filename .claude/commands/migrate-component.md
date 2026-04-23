---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(npx playwright:*), Bash(cd packages/web*), Read, Glob, Grep
description: Orchestrate a full Figma → code component migration. Reads the Figma design context, diffs the current implementation, lists consumers via Grep, then delegates to component-builder (executor), component-reviewer (token/a11y gate), and ui-visual-reviewer (screenshot regression).
---

# /migrate-component

Orchestrate the full design-system migration pipeline for a single UI component.

**Usage:** `/migrate-component <ComponentName>`

Example: `/migrate-component Button`

---

## Step 1 — Read the Figma design context

Use Figma MCP to get the component's node. Extract:
- All variants and their props.
- Design tokens (Figma variables) used.
- Slot structure and composition.
- Light / dark mode differences.

If Figma Desktop MCP is unavailable, fall back to Figma Web MCP. Note which was used.

---

## Step 2 — Diff the current implementation

1. Read the current component: `packages/web/src/components/ui/<ComponentName>.tsx` (lowercase, kebab-case filename).
2. Read `packages/web/src/index.css` for available design tokens.
3. Identify what changed: new variants, removed variants, token changes, prop changes, composition changes.

---

## Step 3 — List consumers

Use Grep to find every file importing the component:

```bash
grep -r "from.*components/ui/<ComponentName>" packages/web/src --include="*.ts" --include="*.tsx" -l
```

Note the count. If more than 5 consumers exist, flag this as a tripwire before calling `component-builder`.

---

## Step 4 — Propose the migration plan

Before delegating to the executor, present:

```
## Migration plan: <ComponentName>

### Figma source
- Node: <Figma node ID>
- Variants: [list]
- Tokens: [list]

### Current implementation delta
- New variants: [list or none]
- Removed variants: [list or none]
- Token changes: [list or none]
- Composition changes: [yes/no + detail]

### Consumers
- Count: N files
- Risk: low (≤5) / elevated (>5)

### Tripwires that will fire
- [list any of the 5 tripwire conditions that apply]

Proceed?
```

Wait for explicit confirmation before proceeding to Step 5.

---

## Step 5 — Delegate to component-builder (executor)

Spawn `component-builder` as a subagent with:
- The Figma context from Step 1.
- The current implementation diff from Step 2.
- The consumer list from Step 3.
- The tripwire pre-assessment from Step 4.

`component-builder` will write the new component and call `component-reviewer` when tripwires fire.

---

## Step 6 — Gate: component-reviewer

Spawn `component-reviewer` on the completed diff. It checks:
- Design token usage (no raw hex, no arbitrary Tailwind).
- Dark mode parity.
- Radix composition.
- Accessibility primitives.
- TypeScript strictness.

If `component-reviewer` returns findings, return control to `component-builder` to fix them before proceeding.

---

## Step 7 — Gate: ui-visual-reviewer

Once `component-reviewer` passes, spawn `ui-visual-reviewer`. It will:
- Run Playwright if a config exists in `packages/web/`, scoped to the migrated component.
- Fall back to Claude_Preview if Playwright is not configured for this component.
- Verify visual accuracy in light and dark themes, and feature behavior.

- **Pass** → component is PR-ready.
- **Fail** → return to `component-builder` with the specific finding.

---

## Step 8 — Summary

Report:

```
## /migrate-component result: <ComponentName>

### Pipeline
- Figma source: [node ID / MCP used]
- Implementation delta: [summary]
- Consumers updated: [count]

### Gates
- component-reviewer: PASS / FAIL (fixed)
- ui-visual-reviewer: PASS / SNAPSHOTS UPDATED / BLOCKED

### Files modified
- <path>: <summary>

### Next steps
- Run `make test-web` to confirm Vitest passes.
- Open PR with snapshot update (if applicable).
```

---

## Tutor mode

If asked "how does /migrate-component work?" or "when should I use this?":
- Purpose: orchestrate the full Figma → shadcn/Radix migration for one component.
- It is the entry point — you call it, it handles the rest.
- Delegates to: `component-builder` (build), `component-reviewer` (convention gate), `ui-visual-reviewer` (visual gate).
- Requires Figma Desktop MCP (or Figma Web MCP as fallback).
- Cap: 200 words.

## Coaching trailer

If env `DB90_COACHING` is `true`, end with:

> *(You ran `/migrate-component`, which orchestrates the full Figma → code pipeline. Run `/help-tooling migrate-component` to see what each step does.)*
