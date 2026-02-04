import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SortButton, type SortDirection } from '@/components/ui/sort-button';
import { RiskBadge } from '@/components/dashboard/ActivityFeed';
import { formatDistanceToNow, humanizeToolName, cn } from '@/lib/utils';

export interface EventRow {
  id: string;
  tool_name?: string;
  event_type?: string;
  risk_level?: 'critical' | 'high' | 'medium' | 'low' | 'none';
  cost_usd?: number;
  created_at?: string;
  user?: { email: string };
  project?: { name: string };
  token_count?: number;
}

type SortField = 'created_at' | 'tool_name' | 'risk_level' | 'cost_usd';

interface EventsTableProps {
  events: EventRow[];
  isLoading?: boolean;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField) => void;
  onEventClick?: (eventId: string) => void;
  selectedEventId?: string | null;
  className?: string;
}

function EventRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-14" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
    </TableRow>
  );
}

function formatCost(cost: unknown): string {
  if (cost === undefined || cost === null) return '-';
  const numCost = Number(cost);
  if (isNaN(numCost)) return '-';
  return `$${numCost.toFixed(3)}`;
}

function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined || tokens === null) return '-';
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

export function EventsTable({
  events,
  isLoading,
  sortField,
  sortDirection,
  onSort,
  onEventClick,
  selectedEventId,
  className,
}: EventsTableProps) {
  return (
    <div className={cn('rounded-md border overflow-x-auto', className)}>
      <Table className="min-w-[700px]">
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
            <TableHead className="hidden md:table-cell">User</TableHead>
            <TableHead className="hidden lg:table-cell">Project</TableHead>
            <TableHead className="w-[80px] sm:w-[100px]">
              <SortButton
                field="cost_usd"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Cost
              </SortButton>
            </TableHead>
            <TableHead className="hidden sm:table-cell w-[80px]">Tokens</TableHead>
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => <EventRowSkeleton key={i} />)
          ) : events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center">
                <p className="text-muted-foreground">No events found</p>
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <TableRow
                key={event.id}
                className={cn(
                  'group cursor-pointer hover:bg-muted/50 transition-colors',
                  selectedEventId === event.id && 'bg-muted'
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
                    {(event.event_type || 'unknown').replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell>
                  <RiskBadge level={event.risk_level || 'none'} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                    {event.user?.email || '-'}
                  </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
                    {event.project?.name || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono-display text-sm">
                    {formatCost(event.cost_usd)}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="font-mono-display text-sm text-muted-foreground">
                    {formatTokens(event.token_count)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {formatDistanceToNow(event.created_at)}
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
