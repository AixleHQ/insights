import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, User, Folder, DollarSign, FileText, Shield, Cpu } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskBadge } from "@/components/ui/risk-badge";
import { normalizeRiskLevel } from "@/lib/riskLevel";
import { useOrg } from "@/contexts/OrgContext";
import { EventTypeBadge } from "@/components/ui/event-type-badge";
import { cn, humanizeToolName } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";
import { formatCost, formatTokens, isDayGranularityEvent, formatEventDate, formatDateTime } from "@/lib/formatters";
import { useCurrentUser } from "@/hooks/useApi";
import { canViewEventPrompt } from "@/lib/eventAccess";
import { parseRecentCommitFields } from "@/lib/recentCommitEvent";
import { isDerivativeEvent } from "@/lib/event-types";
import { RecentCommitDetail } from "./RecentCommitDetail";
import { ContentPanel } from "./ContentPanel";
import { MetadataTable } from "./MetadataTable";

export interface EventDetailData {
  id: string;
  tool_name?: string;
  event_type?: string;
  model?: string | null;
  risk_level?: "critical" | "high" | "medium" | "low" | "none";
  cost_usd?: number;
  token_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  created_at: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  project?: {
    id: string;
    name: string;
  };
  metadata?: Record<string, unknown> | null;
  // Owner-only captured prompt text. undefined => viewer is not an owner (gated);
  // null => owner but no captured text (capture off / no row).
  event_text?: {
    user_text: string | null;
    assistant_text: string | null;
    sanitized_at: string | null;
  } | null;
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

export function EventDetail({ event, isLoading, className }: EventDetailProps) {
  const { currentRole } = useOrg();
  const { data: me } = useCurrentUser();
  const isOwner = canViewEventPrompt(
    currentRole,
    Boolean(me?.globalAdmin ?? me?.super_admin)
  );

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
          <Link to={AppRoutes.events.root}>
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
  const isDerivative = isDerivativeEvent(event.event_type);
  const emptyPromptMessage = isDerivative
    ? "This event has no prompt text. See its summary above."
    : "No prompt text. Prompt capture is not enabled for this event.";

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" aria-label="Back to events">
            <Link to={AppRoutes.events.root}>
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
                    to={AppRoutes.projects.detail(event.project.id)}
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
                  <span className="text-sm">{formatCost(event.cost_usd)}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )
              }
            />
            <DetailRow
              icon={FileText}
              label="Tokens In"
              value={
                event.input_tokens !== undefined ? (
                  <span className="font-mono-display">
                    {formatTokens(event.input_tokens)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )
              }
            />
            <DetailRow
              icon={FileText}
              label="Tokens Out"
              value={
                event.output_tokens !== undefined ? (
                  <span className="font-mono-display">
                    {formatTokens(event.output_tokens)}
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
              {isDerivative
                ? "This event type has no prompt content"
                : "Raw and sanitized content from this event"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isOwner ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Prompt content is visible to organization owners only.
              </p>
            ) : isDerivative ? (
              <Tabs defaultValue="metadata">
                <TabsList>
                  <TabsTrigger value="metadata">Metadata</TabsTrigger>
                </TabsList>
                <TabsContent value="metadata" className="mt-4">
                  <ContentPanel
                    title="Event Metadata"
                    content={
                      event.metadata
                        ? JSON.stringify(event.metadata, null, 2)
                        : undefined
                    }
                    emptyMessage={emptyPromptMessage}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <Tabs defaultValue="prompt">
                <TabsList>
                  <TabsTrigger value="prompt">Prompt</TabsTrigger>
                  <TabsTrigger value="metadata">Metadata</TabsTrigger>
                </TabsList>
                <TabsContent value="prompt" className="mt-4 space-y-4">
                  {event.event_text ? (
                    <>
                      <ContentPanel
                        title="User"
                        content={event.event_text.user_text}
                        emptyMessage="No user text captured"
                      />
                      <ContentPanel
                        title="Assistant"
                        content={event.event_text.assistant_text}
                        emptyMessage="No assistant text captured"
                      />
                    </>
                  ) : (
                    <ContentPanel title="Prompt" emptyMessage="Prompt capture not enabled" />
                  )}
                </TabsContent>
                <TabsContent value="metadata" className="mt-4">
                  <MetadataTable metadata={event.metadata} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
