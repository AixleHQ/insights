/**
 * Returns true only for org owners.
 * Gates prompt content, sanitized/raw tabs, metadata, and security findings.
 */
export function canViewEventPrompt(role: string | null | undefined): boolean {
  return role === "owner";
}

/** Returns true only for org owners. Controls User column in EventsTable. */
export function showEventsUserColumn(role: string | null | undefined): boolean {
  return role === "owner";
}

export type SortField = "created_at" | "tool_name" | "risk_level" | "cost_usd";
export type SortDirection = "asc" | "desc";

export const riskLevelOrder = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
} as const;
