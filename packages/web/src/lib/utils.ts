import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ToolEvent } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a Date as a local YYYY-MM-DD string (not toISOString, which renders
 * in UTC and can shift the calendar day for users outside UTC).
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string as relative time (e.g., "5m ago", "2h ago")
 */
export function formatDistanceToNow(date: string | Date | undefined | null): string {
  if (!date) return "unknown";

  const now = new Date();
  const target = typeof date === "string" ? new Date(date) : date;

  // Check for invalid date
  if (isNaN(target.getTime())) return "unknown";

  const diffMs = now.getTime() - target.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format a number as currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Known tool name mappings for proper display
 */
const TOOL_NAME_MAP: Record<string, string> = {
  "claude_code": "Claude Code",
  "claude-code": "Claude Code",
  "github_copilot": "GitHub Copilot",
  "github-copilot": "GitHub Copilot",
  "github": "GitHub",
  "gitlab": "GitLab",
  "bitbucket": "Bitbucket",
  "cursor": "Cursor",
  "aider": "Aider",
  "codeium": "Codeium",
  "windsurf": "Windsurf",
  "continue": "Continue",
  "copilot": "Copilot",
  "tabnine": "Tabnine",
  "cody": "Cody",
  "supermaven": "Supermaven",
  "sourcegraph": "Sourcegraph",
  "replit": "Replit",
  "amazon_q": "Amazon Q",
  "amazon-q": "Amazon Q",
  "gemini": "Gemini",
  "chatgpt": "ChatGPT",
  "openai": "OpenAI",
  "openai_api": "OpenAI API",
  "openrouter_api": "OpenRouter API",
  "gemini_api": "Gemini API",
  // Pre-staged for AIX-509 (Bedrock connector); not yet in ToolEvent::TOOL_NAMES.
  "bedrock_api": "Bedrock API",
  "anthropic": "Anthropic",
  "anthropic_api": "Anthropic API",
  "jira": "Jira",
  "linear": "Linear",
  "custom": "Custom",
};

/**
 * Whether `slug` has an explicit curated label in `TOOL_NAME_MAP` (vs. the
 * Title-case fallback). Testable surface for the label-drift guard: single-word
 * slugs like `custom` humanize identically with or without a map entry, so map
 * membership must be checked directly.
 */
export function hasCuratedToolLabel(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_NAME_MAP, slug.toLowerCase().trim());
}

/**
 * Map a ToolEvent API response to the EventRow shape expected by EventsTable.
 */
export function toEventRow(e: ToolEvent) {
  return {
    id: e.id,
    tool_name: e.toolName,
    event_type: e.eventType,
    attribution: e.attribution,
    risk_level: e.riskLevel,
    cost_usd: e.costUsd,
    token_count: (e.inputTokens || 0) + (e.outputTokens || 0),
    created_at: e.occurredAt || e.createdAt,
    user: e.user ? { email: e.user.email, name: e.user.name, avatarUrl: e.user.avatarUrl } : undefined,
    suggested_user: e.suggestedUser ? { email: e.suggestedUser.email, name: e.suggestedUser.name, avatarUrl: e.suggestedUser.avatarUrl } : null,
    project: e.project ? { name: e.project.name } : undefined,
    project_id: e.project?.id,
    model: e.model,
  };
}

/**
 * Return a member's display name, falling back to the email local-part.
 */
export function getMemberDisplayName(member: { name?: string | null; email: string }): string {
  return member.name ?? member.email.split("@")[0];
}

/** Resolve user id from an organization membership (API nests id under `user`). */
export function organizationMemberUserId(member: {
  userId?: string;
  user_id?: string;
  user?: { id?: string };
}): string | undefined {
  return member.userId ?? member.user_id ?? member.user?.id;
}

/**
 * Humanize a tool name for display
 * Converts snake_case/kebab-case to Title Case with proper casing for known tools
 */
export function humanizeToolName(toolName: string | undefined | null): string {
  if (!toolName) return "Unknown Tool";

  const normalized = toolName.toLowerCase().trim();

  // Check for known tool names first
  if (TOOL_NAME_MAP[normalized]) {
    return TOOL_NAME_MAP[normalized];
  }

  // Fallback: convert snake_case/kebab-case to Title Case
  return toolName
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const TOOL_COLOR_MAP: Record<string, string> = {
  claude_code: "var(--color-warning)",
  "claude-code": "var(--color-warning)",
  github_copilot: "#7EC4FD",
  "github-copilot": "#7EC4FD",
  github: "#7EC4FD",
  cursor: "#AD96FF",
  aider: "hsl(142 71% 45%)",
  windsurf: "hsl(199 89% 48%)",
  cody: "hsl(339 90% 51%)",
  other: "hsl(220 9% 46%)",
};

export function getToolColor(toolName: string | undefined | null): string {
  if (!toolName) return "hsl(220 9% 46%)";
  const normalized = toolName.toLowerCase().trim();
  return TOOL_COLOR_MAP[normalized] ?? "hsl(220 9% 46%)";
}
