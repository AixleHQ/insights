import React from "react";
import {
  Clock,
  User,
  Shield,
  Globe,
  Monitor,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getAuditActionLabel } from "@/lib/audit-actions";
import { SEVERITY_CLASS } from "@/lib/audit-styles";
import type { UnifiedAuditLog } from "@/lib/types";

interface AuditLogDrawerProps {
  log: UnifiedAuditLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function DetailRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function AuditLogDrawer({
  log,
  open,
  onOpenChange,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: AuditLogDrawerProps) {
  const formattedDate = log?.createdAt
    ? new Date(log.createdAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const hasTrackedChanges =
    log?.trackedChanges && Object.keys(log.trackedChanges).length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-xl md:max-w-2xl"
        showCloseButton={false}
      >
        {!log ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Audit log entry</SheetTitle>
              <SheetDescription>Loading audit log details</SheetDescription>
            </SheetHeader>
            <DrawerSkeleton />
          </>
        ) : (
          <>
            <SheetHeader className="border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle className="truncate text-base">
                      {getAuditActionLabel(log.action, log.scope)}
                    </SheetTitle>
                    <Badge variant="outline" className="text-xs capitalize">
                      {log.scope}
                    </Badge>
                    {log.severity && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          SEVERITY_CLASS[log.severity]
                        )}
                      >
                        {log.severity}
                      </span>
                    )}
                    {log.outcome && (
                      <Badge
                        variant={log.outcome === "failure" ? "destructive" : "outline"}
                        className={cn(
                          "text-xs",
                          log.outcome === "success" && "text-green-600 dark:text-green-400"
                        )}
                      >
                        {log.outcome}
                      </Badge>
                    )}
                  </div>
                  <SheetDescription className="mt-1">{formattedDate}</SheetDescription>
                </div>
                <div className="flex items-center gap-1">
                  {onNavigate && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onNavigate("prev")}
                        disabled={!hasPrev}
                      >
                        <ChevronLeft className="size-4" />
                        <span className="sr-only">Previous entry</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onNavigate("next")}
                        disabled={!hasNext}
                      >
                        <ChevronRight className="size-4" />
                        <span className="sr-only">Next entry</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-6 p-6">
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Details
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailRow icon={Clock} label="Date" value={formattedDate} />
                    <DetailRow
                      icon={User}
                      label="Actor"
                      value={
                        log.actor ? (
                          <div>
                            <p>{log.actor.name || log.actor.email}</p>
                            {log.actor.name && (
                              <p className="text-xs font-normal text-muted-foreground">
                                {log.actor.email}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )
                      }
                    />
                    <DetailRow
                      icon={Shield}
                      label="Scope"
                      value={<span className="capitalize">{log.scope}</span>}
                    />
                    <DetailRow
                      icon={FileText}
                      label="Resource"
                      value={
                        log.resourceType ? (
                          <span>
                            {log.resourceType}
                            {log.resourceId && (
                              <span className="ml-1 font-mono text-xs text-muted-foreground">
                                #{log.resourceId.slice(0, 8)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      }
                    />
                    <DetailRow
                      icon={Globe}
                      label="IP Address"
                      value={
                        log.ipAddress ? (
                          <span className="font-mono text-xs">{log.ipAddress}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      }
                    />
                    <DetailRow
                      icon={Monitor}
                      label="User Agent"
                      value={
                        log.userAgent ? (
                          <span className="line-clamp-2 text-xs">{log.userAgent}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      }
                    />
                  </div>
                </div>

                {hasTrackedChanges && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Tracked Changes
                      </h3>
                      <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                        <code className="whitespace-pre-wrap break-all">
                          {JSON.stringify(log.trackedChanges, null, 2)}
                        </code>
                      </pre>
                    </div>
                  </>
                )}

                <Separator />
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Metadata
                  </h3>
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                    <code className="whitespace-pre-wrap break-all">
                      {JSON.stringify(log.metadata, null, 2)}
                    </code>
                  </pre>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
