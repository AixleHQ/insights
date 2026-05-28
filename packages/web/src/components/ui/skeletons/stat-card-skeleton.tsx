import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardSkeletonProps {
  className?: string;
  showIcon?: boolean;
  showDescription?: boolean;
}

export function StatCardSkeleton({
  className,
  showIcon = true,
  showDescription = false,
}: StatCardSkeletonProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-28" />
            {showDescription && <Skeleton className="h-3 w-24" />}
          </div>
          {showIcon && <Skeleton className="size-10 rounded-lg" />}
        </div>
      </CardContent>
    </Card>
  );
}
