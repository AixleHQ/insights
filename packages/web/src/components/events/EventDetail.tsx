import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, User, Folder, DollarSign, FileText, Shield, Cpu } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskBadge } from "@/components/ui/risk-badge";
import { normalizeRiskLevel } from "@/lib/riskLevel";
import { useOrg } from "@/contexts/OrgContext";
import { EventTypeBadge } from "@/components/ui/event-type-badge";
import { cn, humanizeToolName } from "@/lib/utils";
import { formatCost, formatTokens, isDayGranularityEvent, formatEventDate, formatDateTime } from "@/lib/formatters";
import { canViewEventPrompt } from "@/lib/eventAccess";
import { parseRecentCommitFields } from "@/lib/recentCommitEvent";
import { RecentCommitDetail } from "./RecentCommitDetail";

export interface EventDetailData {
  id: string;
  tool_name?: string;
  event_type?: string;
  model?: string | null;
  risk_level?: "critical" | "high" | "medium" | "low" | "none";
  cost_usd?: number;
  token_count?: number;
  created_at: string;
  sanitized_at?: string;
  classified_at?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  project?: {
    id: string;
    name: string;
  };
  raw_content?: string;
  sanitized_content?: string;
  metadata?: Record<string, unknown> | null;
  findings?: Array<{
    type: string;
    severity: string;
    description: string;
    location?: string;
  }>;
}

interface EventDetailProps {
  event: EventDetailData | null;
  isLoading?: boolean;
  className?: string;
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
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
        <code>{content || "No content available"}</code>
      </pre>
    </div>
  );
}

export function EventDetail({ event, isLoading, className }: EventDetailProps) {
  const { currentRole } = useOrg();
  const isOwner = canViewEventPrompt(currentRole);

  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <p className="text-muted-foreground">Event not found</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/events">
            <ArrowLeft className="mr-2 size-4" />
            Back to events
          </Link>
        </Button>
      </div>
    );
  }

  const formattedDate = isDayGranularityEvent(event.tool_name, event.created_at)
    ? formatEventDate(event.created_at)
    : formatDateTime(event.created_at);

  const recentCommit = parseRecentCommitFields(event.metadata, event.event_type);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" aria-label="Back to events">
            <Link to="/events">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="type-h3">{humanizeToolName(event.tool_name)}</h1>
              <RiskBadge level={normalizeRiskLevel(event.risk_level)} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <EventTypeBadge type={event.event_type} />
              <span>· {formattedDate}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="type-body-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  >
                    {event.project.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )
              }
            />
            <Separator />
            <DetailRow
              icon={DollarSign}
              label="Cost"
              value={
                event.cost_usd !== undefined ? (
                  <span className="font-mono-display">{formatCost(event.cost_usd)}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )
              }
            />
            <DetailRow
              icon={FileText}
              label="Tokens"
              value={
                event.token_count !== undefined ? (
                  <span className="font-mono-display">
                    {formatTokens(event.token_count)}
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
            <DetailRow
              icon={Shield}
              label="Risk Level"
              value={<RiskBadge level={normalizeRiskLevel(event.risk_level)} />}
            />
          </CardContent>
        </Card>

        {recentCommit && (
          <Card className="md:col-span-3">
            <CardContent className="pt-6">
              <RecentCommitDetail commit={recentCommit} />
            </CardContent>
          </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="type-body-lg">Content</CardTitle>
            <CardDescription>
              Raw and sanitized content from this event
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOwner ? (
              <Tabs defaultValue="sanitized">
                <TabsList>
                  <TabsTrigger value="sanitized">Sanitized</TabsTrigger>
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                  <TabsTrigger value="metadata">Metadata</TabsTrigger>
                </TabsList>
                <TabsContent value="sanitized" className="mt-4">
                  <ContentPanel
                    title="Sanitized Content"
                    content={event.sanitized_content}
                  />
                </TabsContent>
                <TabsContent value="raw" className="mt-4">
                  <ContentPanel title="Raw Content" content={event.raw_content} />
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
          </CardContent>
        </Card>
      </div>

      {isOwner && event.findings && event.findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="type-body-lg">Security Findings</CardTitle>
            <CardDescription>
              Issues detected during content analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {event.findings.map((finding, index) => (
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
                      Location: {finding.location}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
