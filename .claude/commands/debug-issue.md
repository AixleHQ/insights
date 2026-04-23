---
description: Systematically debug issues using code navigation
---

## Debug Issue

Trace and debug issues systematically using search and read tools.

### Steps

1. Use Grep to find code related to the issue by class name, method, or error string.
2. Grep for all call sites of the suspect function to trace where it is invoked.
3. Use Read to examine files at relevant line numbers.
4. Run `git log --oneline -20 -- <file>` to check if recent commits touch the affected area.
5. Use Glob to find related test files and check what is covered.

### Tips

- Search for the error message or exception class first — it often points directly to the source.
- Check both the method definition and all its call sites.
- Recent commits are the most common source of regressions.
- Narrow your grep path to the relevant package (`packages/api/` or `packages/web/`) to reduce noise.
