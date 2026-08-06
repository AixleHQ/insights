/**
 * Returns true for org owners and platform global admins.
 * Gates prompt content and related sensitive event details.
 */
export function canViewEventPrompt(
  role: string | null | undefined,
  isGlobalAdmin = false
): boolean {
  return role === "owner" || isGlobalAdmin;
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
