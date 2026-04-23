---
description: Translate a Figma URL into production-ready code using the Figma MCP server — 7-step workflow with visual validation. Use when implementing any Figma design node.
---

# Implement Design

## Overview

Structured workflow for translating Figma designs into production-ready code with pixel-perfect accuracy. Ensures consistent integration with the Figma MCP server, proper use of design tokens, and 1:1 visual parity with designs.

## Prerequisites

- Figma MCP server must be connected and accessible. Verify by checking if `get_design_context` is available.
- User must provide a Figma URL: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
- Project should have an established design system or component library (preferred)

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Get Node ID

Parse the Figma URL to extract file key and node ID.

**URL format:** `https://figma.com/design/:fileKey/:fileName?node-id=1-2`

- **File key:** segment after `/design/`
- **Node ID:** value of `node-id` query parameter

**Example:**
- URL: `https://figma.com/design/kL9xQn2VwM8pYrTb4ZcHjF/DesignSystem?node-id=42-15`
- File key: `kL9xQn2VwM8pYrTb4ZcHjF`
- Node ID: `42-15`

### Step 2: Fetch Design Context

```
get_design_context(fileKey=":fileKey", nodeId="1-2")
```

Provides: layout properties, typography specs, color values/tokens, component structure, spacing values.

**If response is truncated:**
1. Run `get_metadata(fileKey=":fileKey", nodeId="1-2")` for high-level node map
2. Identify child nodes from metadata
3. Fetch each: `get_design_context(fileKey=":fileKey", nodeId=":childNodeId")`

### Step 3: Capture Visual Reference

```
get_screenshot(fileKey=":fileKey", nodeId="1-2")
```

This screenshot is the source of truth for visual validation. Keep accessible throughout.

### Step 4: Download Required Assets

- If Figma MCP returns a `localhost` source for image/SVG, use it directly
- Do NOT import new icon packages — assets come from the Figma payload
- Do NOT use placeholders if a `localhost` source is provided

### Step 5: Translate to Project Conventions

- Treat Figma MCP output (React + Tailwind) as design representation, not final code
- Replace Tailwind utilities with project design system tokens
- Reuse existing components instead of duplicating
- Use project's color system, typography scale, spacing tokens
- Respect existing routing, state management, data-fetch patterns

### Step 6: Achieve 1:1 Visual Parity

- Prioritize Figma fidelity
- Avoid hardcoded values — use design tokens from Figma
- When tokens conflict with Figma specs, prefer design system tokens but adjust spacing/sizes minimally
- Follow WCAG for accessibility

### Step 7: Validate Against Figma

Checklist before marking complete:
- Layout matches (spacing, alignment, sizing)
- Typography matches (font, size, weight, line height)
- Colors match exactly
- Interactive states work (hover, active, disabled)
- Responsive behavior follows Figma constraints
- Assets render correctly
- Accessibility standards met

## Implementation Rules

- Place UI components in the project's designated design system directory
- ALWAYS use existing design system components when possible
- Map Figma design tokens → project design tokens
- When a matching component exists, extend it rather than creating new
- Avoid inline styles unless truly necessary for dynamic values
- Add TypeScript types for component props

## Common Issues

**Truncated response:** Use `get_metadata` → identify child nodes → fetch individually.

**Design doesn't match:** Compare side-by-side with Step 3 screenshot. Check spacing, colors, typography in context data.

**Assets not loading:** Verify Figma MCP assets endpoint is accessible at `localhost`.

**Token values differ:** Prefer project tokens for consistency, adjust spacing/sizing to maintain visual fidelity.

## Additional Resources

- [Figma MCP Server Documentation](https://developers.figma.com/docs/figma-mcp-server/)
- [Figma MCP Tools and Prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Figma Variables and Design Tokens](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma)
