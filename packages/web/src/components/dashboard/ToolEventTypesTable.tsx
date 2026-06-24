import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { formatCost, formatTokens, formatCount } from "@/lib/formatters";
import { getEventTypeMeta } from "@/lib/event-types";
import type { ToolEventTypeStat } from "@/lib/types";

interface ToolEventTypesTableProps {
  eventTypes: ToolEventTypeStat[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
      <TableCell className="hidden sm:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="hidden sm:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
    </TableRow>
  );
}

export function ToolEventTypesTable({ eventTypes, isLoading, isError, onRetry }: ToolEventTypesTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Events</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Tokens In</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Tokens Out</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isError ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24">
                <ErrorState
                  compact
                  title="Could not load event types"
                  description="Something went wrong fetching the data."
                  onRetry={onRetry}
                />
              </TableCell>
            </TableRow>
          ) : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : eventTypes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                No event type data for this period.
              </TableCell>
            </TableRow>
          ) : (
            eventTypes.map((row) => {
              const meta = getEventTypeMeta(row.name);
              const Icon = meta.icon;
              const isEmpty = row.eventCount === 0;

              return (
                <TableRow key={row.name} className={isEmpty ? "opacity-40" : undefined}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="size-3.5 text-muted-foreground" />
                      {meta.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCount(row.eventCount)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-sm text-muted-foreground">
                    {formatTokens(row.tokensIn)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-sm text-muted-foreground">
                    {formatTokens(row.tokensOut)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCost(row.costUsd)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
