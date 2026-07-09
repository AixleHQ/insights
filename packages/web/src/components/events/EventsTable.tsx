import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventRowSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/error-state";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import { RiskBadge } from "@/components/ui/risk-badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { normalizeRiskLevel } from "@/lib/riskLevel";
import { EventTypeBadge } from "@/components/ui/event-type-badge";
import { humanizeToolName, cn } from "@/lib/utils";
import {
  formatCost as formatCostValue,
  formatTokens as formatTokensValue,
  getEventActorLabel,
} from "@/lib/formatters";
import { EventTimeCell } from "./EventTimeCell";

export interface EventRow {
  id: string;
  tool_name?: string;
  event_type?: string;
  attribution?: string;
  risk_level?: "critical" | "high" | "medium" | "low" | "none";
  cost_usd?: number;
  created_at?: string;
  user?: { email: string; name?: string | null; avatarUrl?: string | null };
  suggested_user?: { email: string; name?: string | null; avatarUrl?: string | null } | null;
  project?: { name: string };
  project_id?: string;
  token_count?: number;
  model?: string | null;
}

type SortField = "created_at" | "tool_name" | "risk_level" | "cost_usd";

interface EventsTableProps {
  events: EventRow[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField) => void;
  onEventClick?: (eventId: string) => void;
  selectedEventId?: string | null;
  showUserColumn?: boolean;
  className?: string;
}

function formatCost(cost: unknown): string {
  if (cost === undefined || cost === null) return "-";
  const numCost = Number(cost);
  if (isNaN(numCost)) return "-";
  return formatCostValue(numCost);
}

function formatTokenCount(tokens: number | undefined): string {
  if (tokens === undefined || tokens === null) return "-";
  return formatTokensValue(tokens);
}

export function EventsTable({
  events,
  isLoading,
  isError,
  onRetry,
  sortField,
  sortDirection,
  onSort,
  onEventClick,
  selectedEventId,
  showUserColumn = false,
  className,
}: EventsTableProps) {
  // Tool, Type, Risk, User (optional), Time, Cost, Tokens
  const columnCount = showUserColumn ? 7 : 6;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow className="border-b border-border/50">
            <TableHead className="w-[180px] text-muted-foreground type-caption font-medium uppercase tracking-wider">
              <SortButton
                field="tool_name"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Tool
              </SortButton>
            </TableHead>
            <TableHead className="w-[120px] text-muted-foreground type-caption font-medium uppercase tracking-wider">Type</TableHead>
            <TableHead className="w-[110px] text-muted-foreground type-caption font-medium uppercase tracking-wider">
              <SortButton
                field="risk_level"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Risk
              </SortButton>
            </TableHead>
            {showUserColumn && (
              <TableHead className="w-[220px] text-muted-foreground type-caption font-medium uppercase tracking-wider">User</TableHead>
            )}
            <TableHead className="w-[100px] text-muted-foreground type-caption font-medium uppercase tracking-wider">
              <SortButton
                field="created_at"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Time
              </SortButton>
            </TableHead>
            <TableHead className="w-[90px] text-right text-muted-foreground type-caption font-medium uppercase tracking-wider">
              <SortButton
                field="cost_usd"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Cost
              </SortButton>
            </TableHead>
            <TableHead className="w-[80px] text-right text-muted-foreground type-caption font-medium uppercase tracking-wider">Tokens</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isError ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-40 text-center">
                <ErrorState
                  compact
                  title="Could not load events"
                  description="Something went wrong fetching the table."
                  onRetry={onRetry}
                />
              </TableCell>
            </TableRow>
          ) : isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <EventRowSkeleton key={i} showUserColumn={showUserColumn} />
            ))
          ) : events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center">
                <p className="text-muted-foreground">No events found</p>
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <TableRow
                key={event.id}
                className={cn(
                  "group cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30",
                  selectedEventId === event.id && "bg-muted/50"
                )}
                onClick={() => onEventClick?.(event.id)}
              >
                <TableCell>
                  <span className="type-label font-semibold text-foreground">
                    {humanizeToolName(event.tool_name)}
                  </span>
                </TableCell>
                <TableCell>
                  <EventTypeBadge type={event.event_type} />
                </TableCell>
                <TableCell>
                  <RiskBadge level={normalizeRiskLevel(event.risk_level)} />
                </TableCell>
                {showUserColumn && (
                  <TableCell>
                    {event.user ? (
                      <UserAvatar name={event.user.name} email={event.user.email} avatarUrl={event.user.avatarUrl} />
                    ) : event.suggested_user ? (
                      <UserAvatar name={event.suggested_user.name} email={event.suggested_user.email} avatarUrl={event.suggested_user.avatarUrl} suggested />
                    ) : event.attribution && event.attribution !== "unknown" ? (
                      <span className="type-caption text-muted-foreground">{getEventActorLabel({ attribution: event.attribution })}</span>
                    ) : (
                      <span className="type-caption text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <EventTimeCell
                    toolName={event.tool_name}
                    occurredAt={event.created_at}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono-display type-label font-semibold tabular-nums text-foreground">
                    {formatCost(event.cost_usd)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono-display type-caption tabular-nums text-muted-foreground">
                    {formatTokenCount(event.token_count)}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
