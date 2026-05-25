# Story: Cursor recentCommit should ingest as commit activity

Status: done

Completion note: Comprehensive standalone story created for the `mapRecentCommit` event-type misclassification in `@db90/cursor`.

## Story

As a DB90 product user reviewing Cursor usage analytics,
I want Cursor recent AI-assisted commits to be ingested with `event_type = "commit"`,
so that commit activity is visible in event-type breakdowns and chat metrics are not inflated by commit rows.

## Acceptance Criteria

1. `packages/tools/db90-cursor/src/mapper.ts` maps payloads produced by `mapRecentCommit` with `event_type: "commit"` instead of `"chat"`.
2. The local `Db90Payload` TypeScript contract in `packages/tools/db90-cursor/src/mapper.ts` is widened so `event_type` allows `"commit"` alongside `"completion"` and `"chat"`.
3. Running the Cursor connector against a Cursor install that contains `aiCodeTracking.recentCommit` data produces ingest payloads whose rows would land in `tool_events` with `event_type = 'commit'`.
4. `cost_usd`, `tokens_in`, `tokens_out`, `occurred_at`, and recent-commit metadata fields remain unchanged relative to the pre-fix behavior for the same source row. Only the event-type label changes.
5. Non-commit Cursor activity keeps its current classification:
   - legacy `cursor.db` request rows still map via `mapEvent`
   - daily stats `tab*` rows remain `"completion"`
   - daily stats `composer*` rows remain `"chat"`
6. Automated tests covering `mapRecentCommit` are updated to assert `"commit"` for recent-commit payloads and remain green.

## Tasks / Subtasks

- [x] Update the Cursor mapper contract and recent-commit payload type. (AC: 1-2)
  - [x] Change `Db90Payload["event_type"]` in `packages/tools/db90-cursor/src/mapper.ts` from `"completion" | "chat"` to `"completion" | "chat" | "commit"`.
  - [x] Change `mapRecentCommit` so the payload literal uses `event_type: "commit"`.

- [x] Preserve all non-type fields on recent-commit payloads. (AC: 3-5)
  - [x] Keep the existing line-count proxy math for `tokens_in`, `tokens_out`, and `cost_usd`.
  - [x] Keep `metadata.source = "recent_commit"` and the existing commit metadata fields untouched.
  - [x] Do not alter `mapEvent` or `mapDailyStats` event-type behavior in this story.

- [x] Update the mapper tests. (AC: 6)
  - [x] Update `packages/tools/db90-cursor/src/test/mapper.test.ts` so the recent-commit expectation is `"commit"`.
  - [x] Keep the existing assertions around metadata, timestamps, and proxy counts.

- [x] Verify the narrow surface. (AC: 3-6)
  - [x] Run the `@db90/cursor` Vitest mapper coverage or the package test suite.
  - [x] Confirm there is no cost regression by comparing pre/post expected `cost_usd` math in the existing recent-commit test fixture.

### Review Findings

- [x] [Review][Patch] MCP Cursor ingest path parity for recent commits [packages/tools/db90-telemetry-mcp/src/readers/cursor.ts:630]

## Dev Notes

### Business context

`aiCodeTracking.recentCommit` represents commit-scoped activity; before this fix the mappers emitted it as `"chat"`. That caused two user-visible problems:

- commit activity disappears from any event-type breakdown that expects a distinct commit bucket
- chat counts are overstated for Cursor users because recent-commit rows are counted as chat events

The source metadata already distinguishes this payload with `metadata.source = "recent_commit"`, so this fix is a label-correction rather than a new ingest concept.

### Code changed (implementation)

- `packages/tools/db90-cursor/src/mapper.ts`
  - `Db90Payload["event_type"]` widened to include `"commit"`
  - `mapRecentCommit(...)` sets `event_type: "commit"`
- `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts` — same `event_type` union and `mapRecentCommit` label (ingest parity with the CLI connector)

### What must be preserved

- Keep the existing cost model: `cost_model = "estimated_line_count"`
- Keep the current proxy math:
  - `tokens_in = linesAdded + tabLinesAdded + composerLinesAdded`
  - `tokens_out = linesDeleted + tabLinesDeleted + composerLinesDeleted`
  - `cost_usd = computeLineCost("chat", linesAddedProxy + linesDeletedProxy, pricing)`
- Keep timestamp handling via `toIsoString(...)`
- Keep all commit metadata passthrough fields:
  - `commit_hash`
  - `commit_message`
  - `repo_name`
  - `branch_name`
  - `ai_percentage`
  - `source`

The story explicitly changes the classification label, not the cost or proxy-token math. Even though the row becomes a commit event, this story does **not** change the pricing path.

### Scope guardrails

- This is a narrow tool-package fix. Do **not** add schema migrations, backend enum changes, or API contract changes unless implementation proves they are already required by existing ingest handling.
- Do **not** change non-commit mappings in `mapEvent` or `mapDailyStats`.
- Do **not** broaden the work into a telemetry redesign for commit events.

### Duplicated mapper (follow-up idea, not blocking)

`packages/tools/db90-telemetry-mcp/src/readers/cursor.ts` duplicates Cursor mapping logic from `@db90/cursor`. **Parity for this story is implemented** in both packages (`event_type: "commit"`, matching tests). A later refactor could extract a shared module so the two paths cannot drift.

### Architecture / package conventions

- Tool packages in this repo are TypeScript ESM packages under `packages/tools/`
- `@db90/cursor` lives at `packages/tools/db90-cursor/`
- Tests run with Vitest via the package script in `packages/tools/db90-cursor/package.json`
- TypeScript is strict; widening the local union is the minimal safe contract change required for the new literal type

### Files (expected diff)

| File | Action |
|------|--------|
| `packages/tools/db90-cursor/src/mapper.ts` | UPDATE event_type union and `mapRecentCommit` payload literal |
| `packages/tools/db90-cursor/src/test/mapper.test.ts` | UPDATE recent-commit expectation to `"commit"`; assert `cost_usd` unchanged |
| `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts` | Same union + `mapRecentCommit` as connector (parity) |
| `packages/tools/db90-telemetry-mcp/src/test/cursor-mapper.test.ts` | Same expectations as connector tests for recent commit |

### Testing requirements

- From `packages/tools/db90-cursor/`, run:
  - `npm test`
- At minimum, ensure the `mapRecentCommit` test passes with:
  - `event_type === "commit"`
  - unchanged `tokens_in`, `tokens_out`, `occurred_at`, `metadata.source`, and `cost_model`

### Git intelligence (recent commits)

Recent repo activity is around AIX-247 and AIX-249, mostly unrelated to the Cursor mapper surface. No nearby recent commit suggests a competing in-flight change in `packages/tools/db90-cursor/src/mapper.ts`.

### Latest technical information

No external library upgrade or latest-doc research is required for this story. The fix is internal TypeScript mapping logic within the current package structure.

### Project context reference

- `_bmad-output/project-context.md`
  - Tool packages are strict TypeScript ESM under `packages/tools/`
  - Avoid introducing new dependencies or broader architecture changes for a local package fix
  - Run the relevant package tests before marking work complete

### References

- `packages/tools/db90-cursor/src/mapper.ts`
- `packages/tools/db90-cursor/src/test/mapper.test.ts`
- `packages/tools/db90-cursor/src/sync.ts`
- `packages/tools/db90-cursor/package.json`
- `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cursor-mapper.test.ts`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-5-mcp-cursor-sync.md`

## Dev Agent Record

### Agent Model Used

Codex (GPT-5)

### Debug Log References

- `mapRecentCommit` now sets `event_type: "commit"` while preserving `computeLineCost("chat", lineForCost, pricing)` so `cost_usd` matches pre-fix behavior for the same row
- `packages/tools/db90-cursor/src/test/mapper.test.ts` asserts `event_type === "commit"` for the recent-commit fixture and locks `cost_usd` with `toBeCloseTo`
- `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts` mirrors the same `mapRecentCommit` classification and union so MCP and CLI ingest stay aligned
- `_bmad-output/planning-artifacts/` is empty and no `_bmad-output/sprint-status.yaml` exists, so this story is captured as a standalone implementation artifact

### Completion Notes List

- Standalone story created because the repo currently has no sprint-status-driven planning artifact for this fix
- Primary scope is `@db90/cursor` per acceptance criteria; **`@db90/telemetry-mcp` updated in the same change set** for ingest parity (same label + tests)
- Test updates are required implementation work even though the original bug report listed only `mapper.ts`, because the Vitest fixtures had asserted the pre-fix `"chat"` label
- Implemented: widened `Db90Payload["event_type"]` with `"commit"`; `mapRecentCommit` emits `event_type: "commit"` while still using `computeLineCost("chat", …)` for `cost_usd` per scope guardrails
- Tests: recent-commit cases in `@db90/cursor` and `@db90/telemetry-mcp` expect `"commit"`; both assert `cost_usd` `toBeCloseTo(0.00882, 10)` on the shared fixture (28 proxy lines × default chat line-rate) to lock no regression on pricing path
- Verification: `npm test` and `npm run build` in `packages/tools/db90-cursor/` (96 tests, tsc clean); `npm test` in `packages/tools/db90-telemetry-mcp/` for MCP mapper parity
- **MCP parity:** `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts` and `cursor-mapper.test.ts` updated alongside the connector so both ingest paths classify recent commits as `"commit"`

### File List

- `packages/tools/db90-cursor/src/mapper.ts`
- `packages/tools/db90-cursor/src/test/mapper.test.ts`
- `packages/tools/db90-telemetry-mcp/src/readers/cursor.ts`
- `packages/tools/db90-telemetry-mcp/src/test/cursor-mapper.test.ts`
- `_bmad-output/implementation-artifacts/cursor-recent-commit-event-type.md`

## Change Log

- 2026-05-25 — Created standalone BMAD story for Cursor recent-commit `event_type` correction.
- 2026-05-25 — Implemented `@db90/cursor` mapper + test: `mapRecentCommit` → `event_type: "commit"`; aligned `@db90/telemetry-mcp` Cursor reader + tests for parity.
- 2026-05-25 — Follow-up: MCP `cursor-mapper` test asserts `cost_usd` like connector; JSDoc on MCP `mapRecentCommit`; BMAD artifact synced with shipped parity.

## Open questions (saved for the end)

1. **Dedupe:** Should the duplicated Cursor mapper in `db90-telemetry-mcp` eventually import or share code from `@db90/cursor` to prevent future drift? (No code change required for AIX-257 closure.)
