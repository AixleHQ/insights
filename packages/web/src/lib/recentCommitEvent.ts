/**
 * Cursor Path B — recentCommit metadata on tool events (DATA-CURSOR.md §2.7).
 */

export { formatAiPercentage } from "@/lib/formatters";

export interface RecentCommitFields {
  commitHash: string;
  branchName?: string;
  repoName?: string;
  aiPercentage?: number;
  commitMessage?: string;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseAiPercentage(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** True when the event is a Cursor recent-commit ingest (Path B). */
export function isRecentCommitEvent(
  eventType?: string | null,
  metadata?: Record<string, unknown> | null
): boolean {
  if (eventType === "commit") return true;
  return metadata?.source === "recent_commit";
}

/** Extract display fields from event metadata (snake_case from API). */
export function parseRecentCommitFields(
  metadata?: Record<string, unknown> | null,
  eventType?: string | null
): RecentCommitFields | null {
  if (!isRecentCommitEvent(eventType, metadata)) return null;

  const commitHash = asNonEmptyString(metadata?.commit_hash);
  if (!commitHash) return null;

  return {
    commitHash,
    branchName: asNonEmptyString(metadata?.branch_name),
    repoName: asNonEmptyString(metadata?.repo_name),
    aiPercentage: parseAiPercentage(metadata?.ai_percentage),
    commitMessage: asNonEmptyString(metadata?.commit_message),
  };
}

export function formatCommitHashShort(hash: string, length = 7): string {
  if (hash.length <= length) return hash;
  return hash.slice(0, length);
}
