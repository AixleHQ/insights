---
description: Perform a structured code review using change detection and impact analysis
---

## Review Changes

Perform a thorough code review of current changes.

### Steps

1. Run `git diff` (or `git diff HEAD~1`) to see what changed.
2. Use Read to examine each changed file in full context.
3. Use Grep to find all callers of changed functions — assess blast radius manually.
4. Use Glob to find test files for changed code and verify coverage.
5. For any untested changes, suggest specific test cases.

### Output Format

Provide findings grouped by risk level (high/medium/low) with:
- What changed and why it matters
- Test coverage status
- Suggested improvements
- Overall merge recommendation
