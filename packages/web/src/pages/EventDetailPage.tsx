import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { useEvent } from "@/hooks/useApi";
import { EventDetail, type EventDetailData } from "@/components/events";

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();

  const { data: apiEvent, isLoading } = useEvent(currentOrg?.id || "", id || "");

  // Transform API response to EventDetailData format
  const event: EventDetailData | null = useMemo(() => {
    if (!apiEvent) return null;

    return {
      id: apiEvent.id,
      tool_name: apiEvent.toolName,
      event_type: apiEvent.eventType,
      risk_level: apiEvent.riskLevel,
      cost_usd: apiEvent.costUsd,
      token_count: (apiEvent.inputTokens || 0) + (apiEvent.outputTokens || 0),
      created_at: apiEvent.occurredAt || apiEvent.createdAt,
      user: apiEvent.user
        ? {
            id: apiEvent.user.id,
            email: apiEvent.user.email,
            name: apiEvent.user.name || undefined,
          }
        : undefined,
      project: apiEvent.project
        ? {
            id: apiEvent.project.id,
            name: apiEvent.project.name,
          }
        : undefined,
      sanitized_content: apiEvent.sanitizedContent || undefined,
      metadata: apiEvent.model ? { model: apiEvent.model } : undefined,
      findings: apiEvent.securityFindings?.map((f) => ({
        type: f.type,
        severity: f.severity,
        description: f.description,
        location: f.location
          ? `Characters ${f.location.start}-${f.location.end}`
          : undefined,
      })),
    };
  }, [apiEvent]);

  return <EventDetail event={event} isLoading={isLoading} />;
}
