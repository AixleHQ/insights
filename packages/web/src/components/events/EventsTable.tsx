import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import { RiskBadge } from "@/components/dashboard/ActivityFeed";
import { formatDistanceToNow, humanizeToolName, cn } from "@/lib/utils";
import {
  formatCost as formatCostValue,
  formatTokens as formatTokensValue,
  getEventActorLabel,
} from "@/lib/formatters";

export interface EventRow {
  id: string;
  tool_name?: string;
  event_type?: string;
  attribution?: string;
  risk_level?: "critical" | "high" | "medium" | "low" | "none";
  cost_usd?: number;
  created_at?: string;
  user?: { email: string };
  project?: { name: string };
  token_count?: number;
}

type SortField = "created_at" | "tool_name" | "risk_level" | "cost_usd";

interface EventsTableProps {
  events: EventRow[];
  isLoading?: boolean;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField) => void;
  onEventClick?: (eventId: string) => void;
  selectedEventId?: string | null;
  showUserColumn?: boolean;
  className?: string;
}

function EventRowSkeleton({ showUserColumn }: { showUserColumn: boolean }) {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      {showUserColumn && <TableCell><Skeleton className="h-4 w-32" /></TableCell>}
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-14" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    </TableRow>
  );
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
  sortField,
  sortDirection,
  onSort,
  onEventClick,
  selectedEventId,
  showUserColumn = false,
  className,
}: EventsTableProps) {
  const columnCount = showUserColumn ? 8 : 7;

  return (
    <div className={cn("rounded-md border overflow-x-auto", className)}>
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px] sm:w-[140px]">
              <SortButton
                field="tool_name"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Tool
              </SortButton>
            </TableHead>
            <TableHead className="hidden sm:table-cell w-[100px]">Type</TableHead>
            <TableHead className="w-[80px] sm:w-[100px]">
              <SortButton
                field="risk_level"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Risk
              </SortButton>
            </TableHead>
            {showUserColumn && <TableHead className="w-[150px]">User</TableHead>}
            <TableHead className="min-w-[100px]">Project</TableHead>
            <TableHead className="w-[100px] sm:w-[120px]">
              <SortButton
                field="created_at"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Time
              </SortButton>
            </TableHead>
            <TableHead className="hidden sm:table-cell w-[80px] text-right">Tokens</TableHead>
            <TableHead className="w-[80px] sm:w-[100px] text-right">
              <SortButton
                field="cost_usd"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Cost
              </SortButton>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
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
                  "group cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedEventId === event.id && "bg-muted"
                )}
                onClick={() => onEventClick?.(event.id)}
              >
                <TableCell>
                  <span className="font-medium text-sm">
                    {humanizeToolName(event.tool_name)}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-xs capitalize text-muted-foreground">
                    {(event.event_type || "unknown").replace("_", " ")}
                  </span>
                </TableCell>
                <TableCell>
                  <RiskBadge level={event.risk_level || "none"} />
                </TableCell>
                {showUserColumn && (
                  <TableCell>
                    <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                      {getEventActorLabel(event)}
                    </span>
                  </TableCell>
                )}
                <TableCell>
                  <span className="text-sm text-muted-foreground truncate max-w-[140px] block">
                    {event.project?.name || "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className="text-xs sm:text-sm text-muted-foreground"
                    title={
                      event.created_at
                        ? new Date(event.created_at).toLocaleString()
                        : undefined
                    }
                  >
                    {formatDistanceToNow(event.created_at)}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right">
                  <span className="font-mono-display text-sm text-muted-foreground">
                    {formatTokenCount(event.token_count)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono-display text-sm">
                    {formatCost(event.cost_usd)}
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
