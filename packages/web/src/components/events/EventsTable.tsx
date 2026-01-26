import { Link } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/dashboard/ActivityFeed';
import { formatDistanceToNow } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
type SortDirection = 'asc' | 'desc';

interface EventsTableProps {
  events: EventRow[];
  isLoading?: boolean;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField) => void;
  className?: string;
}

function SortButton({
  field,
  currentField,
  currentDirection,
  onSort,
  children,
}: {
  field: SortField;
  currentField?: SortField;
  currentDirection?: SortDirection;
  onSort?: (field: SortField) => void;
  children: React.ReactNode;
}) {
  const isActive = currentField === field;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => onSort?.(field)}
    >
      {children}
      {isActive ? (
        currentDirection === 'asc' ? (
          <ArrowUp className="ml-2 size-3" />
        ) : (
          <ArrowDown className="ml-2 size-3" />
        )
      ) : (
        <ArrowUpDown className="ml-2 size-3 opacity-50" />
      )}
    </Button>
  );
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

export function EventsTable({
  events,
  isLoading,
  sortField,
  sortDirection,
  onSort,
  className,
}: EventsTableProps) {
  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">
              <SortButton
                field="tool_name"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Tool
              </SortButton>
            </TableHead>
            <TableHead className="w-[120px]">Type</TableHead>
            <TableHead className="w-[100px]">
              <SortButton
                field="risk_level"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Risk
              </SortButton>
            </TableHead>
            <TableHead>User</TableHead>
            <TableHead>Project</TableHead>
            <TableHead className="w-[100px]">
              <SortButton
                field="cost_usd"
                currentField={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              >
                Cost
              </SortButton>
            </TableHead>
            <TableHead className="w-[120px]">
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
              <TableCell colSpan={7} className="h-24 text-center">
                <p className="text-muted-foreground">No events found</p>
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <TableRow
                key={event.id}
                className="group cursor-pointer hover:bg-muted/50"
              >
                <TableCell>
                  <Link
                    to={`/events/${event.id}`}
                    className="font-medium hover:underline"
                  >
                    {event.tool_name || 'Unknown'}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="text-xs capitalize text-muted-foreground">
                    {(event.event_type || 'unknown').replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell>
                  <RiskBadge level={event.risk_level || 'none'} />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {event.user?.email || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  {event.project ? (
                    <Link
                      to={`/projects/${event.project.name}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {event.project.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-mono-display text-sm">
                    {formatCost(event.cost_usd)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
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
