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
