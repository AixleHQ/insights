import { Skeleton } from "@/components/ui/skeleton";

export function IntegrationSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}
