import type { EventType } from "@/lib/types";

/** UI filter category keys (what the user picks on /events). */
export type EventCategory = "prompt" | "completion" | "function_call" | "file_operation" | "commit";

/** DB / ingest event_type → human-readable label in Events UI. */
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  chat: "Prompt",
  completion: "Completion",
  tool_use: "Function Call",
  edit: "Edit",
  refactor: "Refactor",
  documentation: "Documentation",
  test: "Test",
  debug: "Debug",
  commit: "Commit",
  review: "Review",
  other: "Other",
  issue: "Issue",
  comment: "Comment",
  sprint: "Sprint",
};

/**
 * UI category → DB values sent to the API filter.
 * NOTE: review/sprint/issue/comment are labelled but not yet UI-filterable;
 * add a category entry here when filtering for those types is needed.
 */
export const EVENT_CATEGORY_TO_DB: Record<EventCategory, EventType[]> = {
  prompt: ["chat"],
  completion: ["completion"],
  function_call: ["tool_use"],
  file_operation: ["edit", "refactor", "documentation", "test", "debug"],
  commit: ["commit"],
};

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  prompt: "Prompt",
  completion: "Completion",
  function_call: "Function Call",
  file_operation: "File Operation",
  commit: "Commit",
};

export function labelForEventType(type: string): string {
  return EVENT_TYPE_LABEL[type as EventType] ?? type.replace(/_/g, " ");
}

/** Returns [] for unknown categories — callers treat empty as "no filter". */
export function dbTypesForCategory(category: EventCategory): EventType[] {
  return EVENT_CATEGORY_TO_DB[category] ?? [];
}
