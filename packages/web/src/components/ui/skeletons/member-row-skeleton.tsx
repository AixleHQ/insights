import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

export function MemberRowSkeleton() {
  return (
    <TableRow>
      <TableCell className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </TableCell>
      <TableCell className="p-4"><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell className="hidden sm:table-cell p-4"><Skeleton className="h-5 w-20" /></TableCell>
      <TableCell className="hidden md:table-cell p-4"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="hidden sm:table-cell p-4"><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell className="hidden sm:table-cell p-4"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="p-4" />
    </TableRow>
  );
}
