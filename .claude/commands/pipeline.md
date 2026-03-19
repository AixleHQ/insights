---
allowed-tools: Bash(gh run list:*), Bash(gh run view:*), Bash(git branch:*)
description: Check the CI/CD pipeline status for the current branch. Shows failing, cancelled, successful, and skipped jobs grouped by status. Use when you want to see if the pipeline passed, what failed, and why.
---

## Context

- Current branch: !`git branch --show-current`
- Latest pipeline run: !`gh run list --branch $(git branch --show-current) --limit 1 --json databaseId,status,conclusion,displayTitle,createdAt,url`

## Your task

Fetch and display the full pipeline status for the latest run on the current branch.

### Step 1 — Get the latest run ID

From the context above, extract the `databaseId` of the latest run.

If no runs are found, tell the user: "No pipeline runs found for this branch. Push a commit to trigger CI."

### Step 2 — Fetch all jobs

```
gh run view <run-id> --json jobs
```

### Step 3 — Display the report

Group jobs by conclusion and display using these icons:
- ❌ `failure` — failed jobs
- 🚫 `cancelled` — cancelled jobs
- ✅ `success` — successful jobs
- ⏭️ `skipped` — skipped jobs

For each **failed** job, also show which step failed (find the step with `conclusion: "failure"`) and include the job URL for quick access to logs.

For each **cancelled** job, show the job URL.

---

## Output Format

```
## Pipeline: [branch name]
[workflow title] — [run URL]

### Summary
❌ X failing  🚫 X cancelled  ✅ X successful  ⏭️ X skipped

---

### ❌ Failing
- **[Job name]** — failed at step: "[step name]"
  [job URL]

### 🚫 Cancelled
- **[Job name]**
  [job URL]

### ✅ Successful
- **[Job name]** (Xm Xs)
- **[Job name]** (Xm Xs)
...

### ⏭️ Skipped
- **[Job name]**
...

---

### Verdict
- **PIPELINE PASSED** — all required checks succeeded.
- **PIPELINE FAILED** — list the failing jobs and their failed steps. Suggest checking the logs at the URLs above.
- **PIPELINE CANCELLED** — some jobs were cancelled, likely due to a failure in a parallel job.
```

### Duration calculation

For each job, calculate duration as: `completedAt - startedAt` in minutes and seconds.

### Verdict logic

- **PASSED**: no `failure` conclusions (cancelled and skipped are acceptable)
- **FAILED**: any job has `conclusion: "failure"`
- **CANCELLED**: only cancellations, no failures
