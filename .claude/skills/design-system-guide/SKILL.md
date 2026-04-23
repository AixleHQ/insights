---
name: design-system-guide
description: Loads when editing or creating UI components under packages/web/src/components/ui. Injects design-token rules, shadcn/Radix composition patterns, dark mode requirements, and a11y primitives. Use whenever touching components/ui/** or any new shadcn component.
---

# design-system-guide

You are editing a shadcn/ui component. DB90 enforces strict design-system conventions because we're in an active Figma → code migration and drift compounds fast.

## Hard rules

### Tokens, not literals

- ✅ `bg-background`, `text-foreground`, `border-border`, `text-risk-critical`
- ❌ `bg-[#0a0a0a]`, `text-[rgb(...)]`, `w-[17px]`, any arbitrary Tailwind value

Tokens are defined in [index.css](packages/web/src/index.css). If a new token is needed, add it there first — do not inline a hex value.

### Composition

- Use shadcn/Radix primitives with `asChild`, `forwardRef`, and CVA variants.
- Merge classes with `cn()` from `@/lib/utils`, never string concat.
- Export types for all props.

### Dark mode parity

Every color decision must work in both themes. If you add a new token, define it in both `:root` and `.dark` branches.

### Accessibility

- Keep ARIA from Radix primitives — don't strip it.
- Support keyboard navigation (Tab, Enter, Escape).
- Label icon-only buttons with `sr-only` text.

### Figma source of truth

Before hand-writing a component, check Figma Desktop MCP:
- `get_design_context` — node structure and style.
- `search_design_system` — is there already a match?
- `get_code_connect_map` — is there a code-connect mapping?
- `get_variable_defs` — pull exact tokens.

## Suggestions

When the user finishes a component edit, suggest:

> **Next:** run `/migrate-component <name>` to trigger the full pipeline (component-reviewer + ui-visual-reviewer + Playwright snapshot). Use this for full migrations, not small tweaks.

## Tutor mode

If the user asks "how does design-system-guide work?" or "when does this trigger?":
- Trigger: edits or creation under `packages/web/src/components/ui/**`.
- What I inject: token rules, composition patterns, dark-mode + a11y, Figma MCP hooks.
- I don't block — I remind. Enforcement is at `component-reviewer`, `ui-visual-reviewer`, and Playwright snapshots in CI.
- Cap: 200 words.
