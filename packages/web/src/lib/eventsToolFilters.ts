/**
 * Canonical `tool_name` values sent to GET /organizations/:id/events match
 * `tool_events.tool_name` / Postgres enum (`packages/api/app/models/tool_event.rb`).
 * Labels are for UI only.
 */
export interface EventsToolFilterOption {
  readonly value: string;
  readonly label: string;
}

/** Subset of common tools shown on the Events page filter (order = sort order in UI). */
export const EVENTS_TOOL_FILTER_OPTIONS: readonly EventsToolFilterOption[] = [
  { value: "github_copilot", label: "GitHub Copilot" },
  { value: "claude_code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "aider", label: "Aider" },
  { value: "tabnine", label: "Tabnine" },
];

export function eventsToolFilterLabel(slug: string): string | undefined {
  return EVENTS_TOOL_FILTER_OPTIONS.find((o) => o.value === slug)?.label;
}
