import { cn } from "@/lib/utils";
import { getEventTypeMeta } from "@/lib/event-types";

const ICON_COLOR = {
  ai:      "text-[var(--et-ai)]",
  code:    "text-[var(--et-code)]",
  quality: "text-[var(--et-quality)]",
  pm:      "text-[var(--et-pm)]",
  other:   "text-[var(--et-other)]",
} as const;

interface EventTypeBadgeProps {
  type: string | null | undefined;
  showIcon?: boolean;
  className?: string;
}

export function EventTypeBadge({ type, showIcon = true, className }: EventTypeBadgeProps) {
  const meta = getEventTypeMeta(type);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/5 px-[7px] py-[3px] text-xs font-medium",
        className
      )}
    >
      {showIcon && <Icon className={cn("size-3 shrink-0", ICON_COLOR[meta.band])} />}
      <span className="text-foreground">{meta.label}</span>
    </span>
  );
}
