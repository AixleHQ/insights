import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

interface EventRowSkeletonProps {
  showUserColumn?: boolean;
}

export function EventRowSkeleton({ showUserColumn = false }: EventRowSkeletonProps) {
  return (
    <TableRow className="skeleton-block">
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      {showUserColumn && (
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      )}
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-14" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    </TableRow>
  );
}
