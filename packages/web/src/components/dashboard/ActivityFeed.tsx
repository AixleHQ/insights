import { Link } from "react-router-dom";
import { formatDistanceToNow, humanizeToolName } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { formatCost, getEventActorLabel } from "@/lib/formatters";
import { ProviderLogo } from "@/components/icons/ProviderLogo";
import { ArrowRight } from "lucide-react";

export interface ActivityEvent {
  id: string;
  tool_name?: string;
  event_type?: string;
  attribution?: string;
  risk_level?: "critical" | "high" | "medium" | "low" | "none";
  cost_usd?: number;
  created_at: string;
  user?: {
    email: string;
  };
  project?: {
    name: string;
  };
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  onEventClick?: (eventId: string) => void;
  selectedEventId?: string | null;
}

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: {
    bg: "bg-risk-critical/10",
    text: "text-risk-critical",
    border: "border-risk-critical/30",
  },
  high: {
    bg: "bg-risk-high/10",
    text: "text-risk-high",
    border: "border-risk-high/30",
  },
  medium: {
    bg: "bg-risk-medium/10",
    text: "text-risk-medium",
    border: "border-risk-medium/30",
  },
  low: {
    bg: "bg-risk-low/10",
    text: "text-risk-low",
    border: "border-risk-low/30",
  },
  none: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-muted",
  },
};

export function RiskBadge({
  level,
  className,
}: {
  level: string;
  className?: string;
}) {
  const colors = riskColors[level] || riskColors.none;

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono-display text-[10px] uppercase tracking-wider",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      {level}
    </Badge>
  );
}

function ActivityItem({
  event,
  onClick,
  isSelected,
}: {
  event: ActivityEvent;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  const timeAgo = formatDistanceToNow(event.created_at);

  const content = (
    <>
      <ProviderLogo provider={event.tool_name || "unknown"} size="sm" showBackground className="shrink-0 !size-8" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{humanizeToolName(event.tool_name)}</span>
          <RiskBadge level={event.risk_level || "none"} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{getEventActorLabel(event)}</span>
          <span>·</span>
          <span>{timeAgo}</span>
          {event.cost_usd !== undefined && Number(event.cost_usd) > 0 && (
            <>
              <span>·</span>
              <span className="font-mono-display">
                {formatCost(Number(event.cost_usd))}
              </span>
            </>
          )}
        </div>
        {event.project && (
          <p className="truncate text-xs text-muted-foreground/70">
            {event.project.name}
          </p>
        )}
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
    </>
  );

  const className = cn(
    "group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50 cursor-pointer",
    isSelected && "bg-muted"
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(className, "w-full text-left")}>
        {content}
      </button>
    );
  }

  return (
    <Link to={`/events/${event.id}`} className={className}>
      {content}
    </Link>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Skeleton className="size-8 rounded-md" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

export function ActivityFeed({
  events,
  isLoading,
  isError,
  onRetry,
  className,
  onEventClick,
  selectedEventId,
}: ActivityFeedProps) {
  return (
    <Card className={cn("col-span-full lg:col-span-2", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
          <CardDescription className="text-xs">
            Latest events across your organization
          </CardDescription>
        </div>
        <Link
          to="/events"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="px-2">
        <ScrollArea className="h-[320px] pr-4">
          {isError ? (
            <div className="flex h-[200px] items-center justify-center">
              <ErrorState
                compact
                title="Could not load activity"
                description="Something went wrong fetching events."
                onRetry={onRetry}
              />
            </div>
          ) : isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <ActivitySkeleton key={i} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((event) => (
                <ActivityItem
                  key={event.id}
                  event={event}
                  onClick={onEventClick ? () => onEventClick(event.id) : undefined}
                  isSelected={selectedEventId === event.id}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
