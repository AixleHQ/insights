import {
  Bug,
  BookOpen,
  CircleHelp,
  Eye,
  Flag,
  FlaskConical,
  GitCommit,
  type LucideIcon,
  MessageCircle,
  MessageSquare,
  Pencil,
  Sparkles,
  Ticket,
  Wand2,
  Wrench,
} from "lucide-react";
import type { EventType } from "@/lib/types";

export type EventTypeBand = "ai" | "code" | "quality" | "pm" | "other";

export interface EventTypeMeta {
  band: EventTypeBand;
  label: string;
  icon: LucideIcon;
}

export const EVENT_TYPES: readonly EventType[] = [
  "chat",
  "completion",
  "edit",
  "commit",
  "review",
  "test",
  "debug",
  "refactor",
  "documentation",
  "other",
  "issue",
  "comment",
  "sprint",
  "tool_use",
] as const;

export const EVENT_TYPE_META: Record<EventType, EventTypeMeta> = {
  chat:          { band: "ai",      label: "Chat",          icon: MessageSquare },
  completion:    { band: "ai",      label: "Completion",    icon: Sparkles },
  edit:          { band: "code",    label: "Edit",          icon: Pencil },
  commit:        { band: "code",    label: "Commit",        icon: GitCommit },
  refactor:      { band: "code",    label: "Refactor",      icon: Wand2 },
  debug:         { band: "code",    label: "Debug",         icon: Bug },
  documentation: { band: "code",    label: "Documentation", icon: BookOpen },
  tool_use:      { band: "code",    label: "Tool use",      icon: Wrench },
  review:        { band: "quality", label: "Review",        icon: Eye },
  test:          { band: "quality", label: "Test",          icon: FlaskConical },
  issue:         { band: "pm",      label: "Issue",         icon: Ticket },
  comment:       { band: "pm",      label: "Comment",       icon: MessageCircle },
  sprint:        { band: "pm",      label: "Sprint",        icon: Flag },
  other:         { band: "other",   label: "Other",         icon: CircleHelp },
};

const FALLBACK_META: EventTypeMeta = {
  band: "other",
  label: "Unknown",
  icon: CircleHelp,
};

export function isKnownEventType(value: string | null | undefined): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export function getEventTypeMeta(value: string | null | undefined): EventTypeMeta {
  if (isKnownEventType(value)) return EVENT_TYPE_META[value];
  return FALLBACK_META;
}

export const EVENT_TYPE_BAND_ORDER: EventTypeBand[] = ["ai", "code", "quality", "pm", "other"];

export const EVENT_TYPE_BAND_LABEL: Record<EventTypeBand, string> = {
  ai:      "AI",
  code:    "Code",
  quality: "Quality",
  pm:      "PM",
  other:   "Other",
};

export const EVENT_TYPE_BAND_DOT_CLASS: Record<EventTypeBand, string> = {
  ai:      "bg-[var(--et-ai)]",
  code:    "bg-[var(--et-code)]",
  quality: "bg-[var(--et-quality)]",
  pm:      "bg-[var(--et-pm)]",
  other:   "bg-[var(--et-other)]",
};

export const EVENT_TYPES_BY_BAND: Record<EventTypeBand, EventType[]> = EVENT_TYPE_BAND_ORDER.reduce(
  (acc, band) => {
    acc[band] = EVENT_TYPES.filter((t) => EVENT_TYPE_META[t].band === band);
    return acc;
  },
  {} as Record<EventTypeBand, EventType[]>
);

export const EVENT_TYPE_BAND_TO_BADGE_VARIANT: Record<
  EventTypeBand,
  "aiEvent" | "codeEvent" | "qualityEvent" | "pmEvent" | "otherEvent"
> = {
  ai: "aiEvent",
  code: "codeEvent",
  quality: "qualityEvent",
  pm: "pmEvent",
  other: "otherEvent",
};
