import { formatDistanceToNow, cn } from "@/lib/utils";
import {
  formatDateTime,
  formatEventDate,
  isDayGranularityEvent,
} from "@/lib/formatters";

export function EventTimeCell({
  toolName,
  occurredAt,
  className,
}: {
  toolName?: string;
  occurredAt?: string;
  className?: string;
}) {
  const dayGranular = isDayGranularityEvent(toolName, occurredAt);
  const label = dayGranular
    ? formatEventDate(occurredAt)
    : formatDistanceToNow(occurredAt);
  const title = occurredAt
    ? dayGranular
      ? formatEventDate(occurredAt)
      : formatDateTime(occurredAt)
    : undefined;

  return (
    <span
      className={cn("text-xs sm:text-sm text-muted-foreground", className)}
      title={title}
    >
      {label}
    </span>
  );
}
