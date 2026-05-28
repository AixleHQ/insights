import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ProjectCardSkeletonProps {
  className?: string;
}

export function ProjectCardSkeleton({ className }: ProjectCardSkeletonProps) {
  return (
    <div className={cn("rounded-lg border p-4 space-y-4", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
