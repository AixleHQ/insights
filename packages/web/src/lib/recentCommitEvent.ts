/**
 * Commit attribution helpers for tool events.
 *
 * Two distinct commit event shapes exist:
 * - Cursor  — event_type: "commit", tool_name: "cursor", has metadata.commit_hash
 *             (DATA-CURSOR.md §2.7 "Path B — recentCommit snapshot")
 * - Claude  — event_type: "commit", tool_name: "claude_code", no commit_hash
 *             (derived from tool_use Bash+git-commit blocks; AIX-259)
 *
 * parseRecentCommitFields() returns null for Claude commits so callers
 * degrade intentionally rather than silently.
 */

export { formatAiPercentage } from "@/lib/formatters";

export interface RecentCommitFields {
  commitHash: string;
  branchName?: string;
  repoName?: string;
  aiPercentage?: number;
  commitMessage?: string;
  source: "cursor";
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
export function isCursorCommitEvent(
  toolName?: string | null,
  eventType?: string | null,
  metadata?: Record<string, unknown> | null
): boolean {
  if (toolName === "cursor" && eventType === "commit") return true;
  return metadata?.source === "recent_commit";
}

/**
 * Extract Cursor commit attribution fields from event metadata.
 * Returns null for Claude commit events (tool_name: "claude_code") — they
 * lack commit_hash and the Cursor-specific attribution fields.
 */
export function parseRecentCommitFields(
  metadata?: Record<string, unknown> | null,
  eventType?: string | null,
  toolName?: string | null
): RecentCommitFields | null {
  if (!isCursorCommitEvent(toolName, eventType, metadata)) return null;

  const commitHash = asNonEmptyString(metadata?.commit_hash);
  if (!commitHash) return null;

  return {
    commitHash,
    branchName: asNonEmptyString(metadata?.branch_name),
    repoName: asNonEmptyString(metadata?.repo_name),
    aiPercentage: parseAiPercentage(metadata?.ai_percentage),
    commitMessage: asNonEmptyString(metadata?.commit_message),
    source: "cursor",
  };
}

export function formatCommitHashShort(hash: string, length = 7): string {
  if (hash.length <= length) return hash;
  return hash.slice(0, length);
}
