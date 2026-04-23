---
description: Navigate and understand codebase structure
---

## Explore Codebase

Navigate and understand the codebase using native search tools.

### Steps

1. Use Glob to discover file structure — start broad, then narrow by directory or pattern.
2. Use Grep to find symbols, classes, or patterns by name or keyword.
3. Use Read to examine specific files in detail.
4. Trace relationships by grepping for import statements or callers of a function.

### Tips

- Start with Glob to get oriented (e.g., `packages/api/app/**/*.rb`, `packages/web/src/**/*.tsx`).
- Use Grep with `output_mode: "content"` and context lines to understand usage in context.
- For a high-level overview, read key entry points: routes, schema, main controllers, top-level components.
- Use Grep with `output_mode: "files_with_matches"` to quickly identify which files are relevant before reading them.
