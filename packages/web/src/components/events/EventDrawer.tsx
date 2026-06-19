import React from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  User,
  Folder,
  DollarSign,
  FileText,
  Shield,
  Cpu,
  ExternalLink,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RiskBadge } from "@/components/ui/risk-badge";
import { normalizeRiskLevel } from "@/lib/riskLevel";
import { useOrg } from "@/contexts/OrgContext";
import { useEvent } from "@/hooks/useApi";
import { labelForEventType } from "@/lib/eventTypes";
import { cn, humanizeToolName } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/formatters";
import { canViewEventPrompt } from "@/lib/eventAccess";
import { parseRecentCommitFields } from "@/lib/recentCommitEvent";
import { RecentCommitDetail } from "./RecentCommitDetail";

interface EventDrawerProps {
  eventId: string | null;
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
        <p className="type-caption text-muted-foreground">{label}</p>
        <div className="mt-0.5 type-label">{value}</div>
      </div>
    </div>
  );
}

function ContentPanel({ title, content }: { title: string; content?: string }) {
  return (
    <div className="space-y-2">
      <h4 className="type-label">{title}</h4>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-4 text-xs">
        <code className="whitespace-pre-wrap break-all">{content || "No content available"}</code>
      </pre>
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
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function EventDrawer({
  eventId,
  open,
  onOpenChange,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: EventDrawerProps) {
  const { currentOrg, currentRole } = useOrg();
  const isOwner = canViewEventPrompt(currentRole);
  const { data: event, isLoading } = useEvent(currentOrg?.id || "", eventId || "");

  const formattedDate = event?.createdAt
    ? new Date(event.createdAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const tokenCount =
    event?.tokensTotal ??
    (event?.inputTokens || 0) + (event?.outputTokens || 0);

  const recentCommit = event
    ? parseRecentCommitFields(event.metadata, event.eventType)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl flex flex-col p-0"
        showCloseButton={false}
      >
        {isLoading || !event ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Event details</SheetTitle>
              <SheetDescription>Loading event details</SheetDescription>
            </SheetHeader>
            <DrawerSkeleton />
          </>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <SheetTitle className="truncate text-lg">
                      {humanizeToolName(event.toolName)}
                    </SheetTitle>
                    <RiskBadge level={normalizeRiskLevel(event.riskLevel)} />
                  </div>
                  <SheetDescription className="mt-1">
                    <span>{labelForEventType(event.eventType || "unknown")}</span>
                    {" · "}
                    {formattedDate}
                  </SheetDescription>
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
                        <span className="sr-only">Previous event</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onNavigate("next")}
                        disabled={!hasNext}
                      >
                        <ChevronRight className="size-4" />
                        <span className="sr-only">Next event</span>
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <Link to={`/events/${event.id}`}>
                      <ExternalLink className="size-4" />
                      <span className="sr-only">Open in full page</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </SheetHeader>

            {/* Scrollable content */}
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-6">
                {/* Details section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Details
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailRow
                      icon={Clock}
                      label="Created"
                      value={formattedDate}
                    />
                    <DetailRow
                      icon={User}
                      label="User"
                      value={
                        event.user ? (
                          <span>{event.user.email}</span>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )
                      }
                    />
                    <DetailRow
                      icon={Folder}
                      label="Project"
                      value={
                        event.project ? (
                          <Link
                            to={`/projects/${event.project.id}`}
                            className="text-primary hover:underline"
                            onClick={() => onOpenChange(false)}
                          >
                            {event.project.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )
                      }
                    />
                    <DetailRow
                      icon={Shield}
                      label="Risk Level"
                      value={<RiskBadge level={normalizeRiskLevel(event.riskLevel)} />}
                    />
                    <DetailRow
                      icon={DollarSign}
                      label="Cost"
                      value={
                        event.costUsd !== undefined ? (
                          <span className="font-mono-display">
                            {formatCost(event.costUsd)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      }
                    />
                    <DetailRow
                      icon={FileText}
                      label="Tokens"
                      value={
                        tokenCount > 0 ? (
                          <span className="font-mono-display">
                            {formatTokens(tokenCount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      }
                    />
                    {event.model && event.model !== "unknown" && (
                      <DetailRow
                        icon={Cpu}
                        label="Model"
                        value={<span className="font-mono text-sm">{event.model}</span>}
                      />
                    )}
                  </div>
                </div>

                {recentCommit && (
                  <>
                    <Separator />
                    <RecentCommitDetail commit={recentCommit} />
                  </>
                )}

                <Separator />

                {/* Content tabs — owner only */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Content
                  </h3>
                  {isOwner ? (
                    <Tabs defaultValue="sanitized">
                      <TabsList className="w-full justify-start">
                        <TabsTrigger value="sanitized">Sanitized</TabsTrigger>
                        <TabsTrigger value="metadata">Metadata</TabsTrigger>
                      </TabsList>
                      <TabsContent value="sanitized" className="mt-4">
                        <ContentPanel
                          title="Sanitized Content"
                          content={event.sanitizedContent || undefined}
                        />
                      </TabsContent>
                      <TabsContent value="metadata" className="mt-4">
                        <ContentPanel
                          title="Event Metadata"
                          content={
                            event.metadata
                              ? JSON.stringify(event.metadata, null, 2)
                              : undefined
                          }
                        />
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Prompt content is visible to organization owners only.
                    </p>
                  )}
                </div>

                {/* Security findings — owner only */}
                {isOwner && event.securityFindings && event.securityFindings.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Security Findings
                      </h3>
                      <div className="space-y-3">
                        {event.securityFindings.map((finding, index) => (
                          <div
                            key={index}
                            className={cn(
                              "rounded-lg border p-3",
                              finding.severity === "critical" &&
                                "border-risk-critical/30 bg-risk-critical/10",
                              finding.severity === "high" &&
                                "border-risk-high/30 bg-risk-high/10",
                              finding.severity === "medium" &&
                                "border-risk-medium/30 bg-risk-medium/10",
                              finding.severity === "low" &&
                                "border-risk-low/30 bg-risk-low/10"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="font-mono-display text-[10px] uppercase"
                              >
                                {finding.type}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-mono-display text-[10px] uppercase",
                                  finding.severity === "critical" && "text-risk-critical",
                                  finding.severity === "high" && "text-risk-high",
                                  finding.severity === "medium" && "text-risk-medium",
                                  finding.severity === "low" && "text-risk-low"
                                )}
                              >
                                {finding.severity}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm">{finding.description}</p>
                            {finding.location && (
                              <p className="mt-1 font-mono-display type-caption text-muted-foreground">
                                Location: {finding.location.start}-{finding.location.end}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
