import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/useApi";
import type { WebhookDeliveriesListResponse } from "@/types/webhookDelivery";
import type { WebhookDeliveryProvider, WebhookDeliveryStatus } from "@/types/webhookDelivery";

export interface WebhookDeliveriesFilters {
  status?: WebhookDeliveryStatus;
  provider?: WebhookDeliveryProvider;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
}

function orgScopedOptions(organizationId: string) {
  return {
    skipOrgHeader: true as const,
    headers: { "X-Organization-ID": organizationId },
  };
}

function buildListPath(organizationId: string, filters: WebhookDeliveriesFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.perPage) params.set("per_page", String(filters.perPage));

  const qs = params.toString();
  return `/organizations/${organizationId}/webhook_deliveries${qs ? `?${qs}` : ""}`;
}

export function useWebhookDeliveries(
  organizationId: string,
  filters: WebhookDeliveriesFilters
) {
  return useQuery({
    queryKey: queryKeys.webhookDeliveries.list(organizationId, filters),
    queryFn: () =>
      api.get<WebhookDeliveriesListResponse>(
        buildListPath(organizationId, filters),
        orgScopedOptions(organizationId)
      ),
    enabled: !!organizationId,
  });
}

export function useRetryWebhookDelivery(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deliveryId: string) => {
      await api.post(
        `/organizations/${organizationId}/webhook_deliveries/${deliveryId}/retry`,
        undefined,
        orgScopedOptions(organizationId)
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhookDeliveries.all(organizationId) });
    },
  });
}
