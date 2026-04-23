---
description: Plan and execute safe refactoring using dependency analysis
---

## Refactor Plan

Plan and execute refactoring safely using search and read tools.

### Steps

1. Use Grep to find all usages of the target symbol across the codebase.
2. Use Glob to discover all files in the affected module or directory.
3. Use Read to understand the current implementation before changing anything.
4. List all call sites — these are the files that will need updates.
5. After changes, use Grep again to verify no stale references remain.

### Safety Checks

- Always enumerate all call sites before renaming or moving code.
- Check test files (`**/*.spec.*`, `**/*_spec.rb`) to ensure tests are updated alongside source.
- Use `git diff` after changes to review the full scope before committing.
- Run linters (`make lint`) and tests (`make test`) before committing.
