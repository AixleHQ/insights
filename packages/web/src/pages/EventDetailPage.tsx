import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { useEvent } from "@/hooks/useApi";
import { useOrgNavGuard } from "@/hooks/useOrgNavGuard";
import { EventDetail, type EventDetailData } from "@/components/events";

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();
  useOrgNavGuard("/events");

  const { data: apiEvent, isLoading } = useEvent(currentOrg?.id || "", id || "");

  // Transform API response to EventDetailData format
  const event: EventDetailData | null = useMemo(() => {
    if (!apiEvent) return null;

    return {
      id: apiEvent.id,
      tool_name: apiEvent.toolName,
      event_type: apiEvent.eventType,
      model: apiEvent.model,
      risk_level: apiEvent.riskLevel,
      cost_usd: apiEvent.costUsd,
      input_tokens: apiEvent.inputTokens ?? undefined,
      output_tokens: apiEvent.outputTokens ?? undefined,
      token_count:
        apiEvent.tokensTotal ??
        (apiEvent.inputTokens || 0) + (apiEvent.outputTokens || 0),
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
      // eventText is owner-only (key absent for members) and may be null when no
      // captured text exists. Preserve the distinction: undefined => non-owner gate,
      // null => owner but capture off / no row.
      event_text:
        apiEvent.eventText === undefined
          ? undefined
          : apiEvent.eventText
            ? {
                user_text: apiEvent.eventText.userText,
                assistant_text: apiEvent.eventText.assistantText,
                sanitized_at: apiEvent.eventText.sanitizedAt,
              }
            : null,
      metadata: apiEvent.metadata,
    };
  }, [apiEvent]);

  return <EventDetail event={event} isLoading={isLoading} />;
}
