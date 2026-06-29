import { Link } from "react-router-dom";
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
import { AppRoutes } from "@/lib/routes";
import type { ToolUserStat } from "@/lib/types";

interface ToolUsersTableProps {
  users: ToolUserStat[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
      <TableCell className="hidden sm:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
    </TableRow>
  );
}

export function ToolUsersTable({ users, isLoading, isError, onRetry }: ToolUsersTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Events</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Total Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isError ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24">
                <ErrorState
                  compact
                  title="Could not load users"
                  description="Something went wrong fetching the data."
                  onRetry={onRetry}
                />
              </TableCell>
            </TableRow>
          ) : isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                No user data for this period.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.userId}>
                <TableCell>
                  <Link
                    to={AppRoutes.members.detail(user.userId)}
                    className="font-medium hover:underline"
                  >
                    {user.name}
                  </Link>
                  {user.email && (
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCount(user.eventCount)}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono text-sm text-muted-foreground">
                  {formatTokens(user.totalTokens)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCost(user.costUsd)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
