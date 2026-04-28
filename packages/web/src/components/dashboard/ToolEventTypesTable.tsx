import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { ToolEventTypeStat } from "@/lib/types";

interface ToolEventTypesTableProps {
  eventTypes: ToolEventTypeStat[];
  isLoading: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function humanizeEventType(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

export function ToolEventTypesTable({ eventTypes, isLoading }: ToolEventTypesTableProps) {
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
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : eventTypes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                No event type data for this period.
              </TableCell>
            </TableRow>
          ) : (
            eventTypes.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-medium">{humanizeEventType(row.name)}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {row.eventCount.toLocaleString()}
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
