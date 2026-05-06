export type WebhookDeliveryStatus = "pending" | "processing" | "delivered" | "failed";

export type WebhookDeliveryProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "jira"
  | "linear"
  | "slack";

export interface WebhookDelivery {
  id: string;
  organizationConnectorId: string;
  provider: WebhookDeliveryProvider;
  eventType: string;
  rawEventKey: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastAttemptedAt: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveriesListResponse {
  data: WebhookDelivery[];
  meta: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}
