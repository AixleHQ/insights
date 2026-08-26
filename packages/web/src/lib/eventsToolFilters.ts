/**
 * Canonical `tool_name` values sent to GET /organizations/:id/events match
 * `tool_events.tool_name` / Postgres enum (`packages/api/app/models/tool_event.rb`).
 * Labels are for UI only.
 *
 * The Events page filter options are NOT hardcoded here — they're derived at
 * runtime from `eventsSummary.byTool` (only tools that have data appear).
 * `CANONICAL_TOOL_NAMES` mirrors the backend enum so guard tests can verify the
 * filter/label surface covers every possible tool.
 */
export interface EventsToolFilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Every `tool_name` the backend can emit. Must match `ToolEvent::TOOL_NAMES` in
 * `packages/api/app/models/tool_event.rb`. Drift is caught two ways: a within-web
 * label-drift test (every entry has a curated label) and the cross-package CI gate
 * `.claude/scripts/tool-enum-parity.ts`, which fails if this list and the Ruby enum
 * diverge in members or order.
 */
export const CANONICAL_TOOL_NAMES: readonly string[] = [
  "claude_code",
  "cursor",
  "windsurf",
  "github_copilot",
  "aider",
  "continue",
  "cody",
  "tabnine",
  "amazon_q",
  "openrouter_api",
  "anthropic_api",
  "openai_api",
  "gemini_api",
  "custom",
  "jira",
  "linear",
  "github",
  "gitlab",
  "bitbucket",
] as const;
