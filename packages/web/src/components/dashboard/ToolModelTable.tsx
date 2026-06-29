import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { ToolModelStat } from "@/lib/types";
import { formatCost, formatTokens, formatPerMillion, formatCount } from "@/lib/formatters";

interface ToolModelTableProps {
  models: ToolModelStat[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

type SortKey = "eventCount" | "costUsd";
type SortDir = "asc" | "desc";

function modelLabel(model: ToolModelStat): string {
  return model.displayName || model.name;
}

function SortButton({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = current === sortKey;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 text-xs font-medium"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive ? (
        dir === "desc" ? (
          <ArrowDown className="ml-1 size-3" />
        ) : (
          <ArrowUp className="ml-1 size-3" />
        )
      ) : (
        <ArrowUpDown className="ml-1 size-3 text-muted-foreground" />
      )}
    </Button>
  );
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
      <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
      <TableCell className="hidden lg:table-cell text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
      <TableCell className="hidden lg:table-cell text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
    </TableRow>
  );
}

export function ToolModelTable({ models, isLoading, isError, onRetry }: ToolModelTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("costUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...models].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">
              <SortButton
                label="Requests"
                sortKey="eventCount"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead className="hidden md:table-cell text-right">Tokens In</TableHead>
            <TableHead className="hidden md:table-cell text-right">Tokens Out</TableHead>
            <TableHead className="text-right">
              <SortButton
                label="Cost"
                sortKey="costUsd"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead className="hidden lg:table-cell text-right">$/M input</TableHead>
            <TableHead className="hidden lg:table-cell text-right">$/M output</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isError ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24">
                <ErrorState
                  compact
                  title="Could not load models"
                  description="Something went wrong fetching the data."
                  onRetry={onRetry}
                />
              </TableCell>
            </TableRow>
          ) : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                No model data for this period.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-medium font-mono text-sm">{modelLabel(row)}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCount(row.eventCount)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">
                  {formatTokens(row.tokensIn)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">
                  {formatTokens(row.tokensOut)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCost(row.costUsd)}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right font-mono text-sm text-muted-foreground">
                  {formatPerMillion(row.price_per_million_input)}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right font-mono text-sm text-muted-foreground">
                  {formatPerMillion(row.price_per_million_output)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
