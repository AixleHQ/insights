---
description: Risk-scored code review (runs risk-score.ts) with auto-escalation to Opus on HIGH/CRITICAL.
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git grep:*), Bash(node --experimental-strip-types*), Read, Glob, Grep
---

## Review Changes

Perform a thorough, risk-aware code review of current changes.

### Step 1 — Collect risk metadata

Run the risk scoring script to get a structured per-file assessment:

```bash
node --experimental-strip-types --no-warnings ${CLAUDE_PROJECT_DIR}/.claude/scripts/risk-score.ts
```

Parse the JSON output. It contains:
- `overall_risk` — LOW / MEDIUM / HIGH / CRITICAL
- `overall_score` — 0–100
- `escalate_to_advisor` — boolean
- `escalation_reason` — human-readable trigger
- `hard_flags_triggered` — list of rule-based overrides
- `files[]` — per-file breakdown (tier, callers, churn, spec coverage, score)

### Step 2 — Advisor escalation (tripwire)

**If `escalate_to_advisor` is true**, print the Opus banner first, then spawn the advisor:

```bash
node --experimental-strip-types --no-warnings ${CLAUDE_PROJECT_DIR}/.claude/hooks/model-indicator.ts opus
```

Then spawn the advisor:

```
Spawn Agent(model=opus):
  - What: writing a risk-scored review report for <N> files (ref: <ref_range>)
  - Risk data: <paste the full JSON report>
  - Key decision: <escalation_reason from JSON>
  - Proposed approach: flag <highest-scoring file> as <risk_level> because <reason>
→ Execute within the guidance returned. Do not deviate without re-escalating.
```

**Do NOT escalate for `overall_risk` LOW or MEDIUM with no hard flags.**

### Step 3 — Read the diff

```bash
git diff <ref_range>
```

For each file flagged HIGH or CRITICAL by the risk report:
- Use Read to examine the file in full context
- Use Grep to spot-check caller patterns if caller_score ≥ 20

### Step 4 — Write the review report

Group findings by risk level. Use the score report as the structural backbone — the model provides the narrative, the script provides the signal.

---

## Output Format

```
## Risk-scored Review

**Ref:** <ref_range>
**Files changed:** N  |  **Overall risk:** HIGH (score: 72)
**Escalation:** <reason or "none">

---

### CRITICAL / HIGH findings

- **[CRITICAL]** `packages/api/db/migrate/20240501_add_retention.rb`
  score=90 · hard_flag=migration_file
  <finding>

### MEDIUM findings

- **[MEDIUM]** `packages/api/app/services/tool_sync_service.rb`
  score=48 · tier=service(28) callers=3(10) churn=1(0) has_spec(0)
  <finding>

### LOW findings
...

---

### Per-file score breakdown

| File | Tier | Callers | Churn | Spec | Score | Risk |
|------|------|---------|-------|------|-------|------|
| ... | ... | ... | ... | ... | ... | ... |

---

### Verdict
**READY TO PUSH** — no blocking issues.
**BLOCK** — <list what must be fixed>
```

---

## Scoring reference (for context)

| Signal | Max pts | Source |
|--------|---------|--------|
| File tier | 40 | Path pattern table |
| Caller count | 30 | `git grep` |
| Churn (90d) | 15 | `git log --since` |
| Test coverage | 15 | Spec file + method match |
| **Total** | **100** | |

Hard flags (always override to minimum score):
- `migration_file` → CRITICAL (≥90)
- `authorize_changed` → HIGH (≥70)
- `destructive_bulk_op` → CRITICAL (≥90)
- `policy_no_spec` → HIGH (≥70)
