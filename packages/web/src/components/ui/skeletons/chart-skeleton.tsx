import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChartSkeletonProps {
  variant?: "area" | "bars";
  height?: number;
  barCount?: number;
  className?: string;
}

export function ChartSkeleton({
  variant = "area",
  height = 200,
  barCount = 4,
  className,
}: ChartSkeletonProps) {
  if (variant === "bars") {
    return (
      <div className={cn("skeleton-block space-y-2 pt-2", className)}>
        {Array.from({ length: barCount }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("skeleton-block flex w-full items-end gap-2", className)}
      style={{ height: `${height}px` }}
    >
      <Skeleton className="h-[40%] flex-1" />
      <Skeleton className="h-[65%] flex-1" />
      <Skeleton className="h-[50%] flex-1" />
      <Skeleton className="h-[80%] flex-1" />
      <Skeleton className="h-[35%] flex-1" />
      <Skeleton className="h-[70%] flex-1" />
      <Skeleton className="h-[55%] flex-1" />
    </div>
  );
}
