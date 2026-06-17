import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  useRetryWebhookDelivery,
  useWebhookDeliveries,
  type WebhookDeliveriesFilters,
} from "@/api/webhookDeliveries";
import { WebhookDeliveryTable } from "@/components/WebhookDeliveryTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";

function parsePage(raw: string | null): number {
  const n = Number(raw || "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function extractApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.data && typeof error.data === "object") {
    const data = error.data as { error?: string; message?: string };
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export function WebhookDeliveriesPage() {
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: organization } = useOrganization(organizationId);

  const filters: WebhookDeliveriesFilters = useMemo(() => {
    return {
      status: (searchParams.get("status") || undefined) as WebhookDeliveriesFilters["status"],
      provider: (searchParams.get("provider") || undefined) as WebhookDeliveriesFilters["provider"],
      dateFrom: searchParams.get("date_from") || undefined,
      dateTo: searchParams.get("date_to") || undefined,
      page: parsePage(searchParams.get("page")),
      perPage: 25,
    };
  }, [searchParams]);

  const { data, isLoading, isFetching, error } = useWebhookDeliveries(organizationId, filters);
  const retryMutation = useRetryWebhookDelivery(organizationId);

  const deliveries = data?.data ?? [];
  const meta = data?.meta;

  const updateSearch = (updates: Record<string, string | undefined>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([key, value]) => {
          if (value === undefined || value === "") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        });
        return next;
      },
      { replace: true }
    );
  };

  const handleRetry = (deliveryId: string) => {
    setActionError(null);
    setRetryingDeliveryId(deliveryId);
    retryMutation.mutate(deliveryId, {
      onSuccess: () => {
        setActionError(null);
      },
      onError: (err) => {
        setActionError(extractApiErrorMessage(err));
      },
      onSettled: () => {
        setRetryingDeliveryId(null);
      },
    });
  };

  const listError =
    error instanceof Error ? error.message : error ? "Failed to load webhook deliveries" : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-fit gap-1 px-0 text-muted-foreground" asChild>
          <Link to="/admin/organizations">
            <ChevronLeft className="size-4" />
            Organizations
          </Link>
        </Button>
        <div>
          <h1 className="type-h2">Webhook deliveries</h1>
          <p className="text-sm text-muted-foreground">
            {organization?.name ?? "Organization"}{" "}
            <span className="font-mono type-caption text-muted-foreground">({organizationId})</span>
          </p>
        </div>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load data</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Retry failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="wd-status">Status</Label>
          <Select
            value={filters.status ?? "all"}
            onValueChange={(v) => {
              updateSearch({ status: v === "all" ? undefined : v, page: "1" });
            }}
          >
            <SelectTrigger id="wd-status" className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wd-provider">Provider</Label>
          <Select
            value={filters.provider ?? "all"}
            onValueChange={(v) => {
              updateSearch({ provider: v === "all" ? undefined : v, page: "1" });
            }}
          >
            <SelectTrigger id="wd-provider" className="w-[160px]">
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="github">GitHub</SelectItem>
              <SelectItem value="gitlab">GitLab</SelectItem>
              <SelectItem value="bitbucket">Bitbucket</SelectItem>
              <SelectItem value="jira">Jira</SelectItem>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="slack">Slack</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wd-from">From</Label>
          <Input
            id="wd-from"
            type="date"
            className="w-[160px]"
            value={searchParams.get("date_from") ?? ""}
            onChange={(e) => {
              updateSearch({ date_from: e.target.value || undefined, page: "1" });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wd-to">To</Label>
          <Input
            id="wd-to"
            type="date"
            className="w-[160px]"
            value={searchParams.get("date_to") ?? ""}
            onChange={(e) => {
              updateSearch({ date_to: e.target.value || undefined, page: "1" });
            }}
          />
        </div>
      </div>

      <div className="relative">
        {isFetching && !isLoading ? (
          <div className="absolute right-0 top-0 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Updating…
          </div>
        ) : null}

        <WebhookDeliveryTable
          deliveries={deliveries}
          isLoading={isLoading}
          retryingDeliveryId={retryingDeliveryId}
          onRetry={handleRetry}
        />
      </div>

      {meta && meta.total_pages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.current_page} of {meta.total_pages} ({meta.total_count} entries)
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={meta.current_page <= 1}
              onClick={() =>
                updateSearch({ page: String(Math.max(1, meta.current_page - 1)) })
              }
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={meta.current_page >= meta.total_pages}
              onClick={() =>
                updateSearch({
                  page: String(Math.min(meta.total_pages, meta.current_page + 1)),
                })
              }
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
