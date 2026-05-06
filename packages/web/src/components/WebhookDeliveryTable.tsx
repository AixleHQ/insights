import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "@/lib/utils";
import type { WebhookDelivery, WebhookDeliveryStatus } from "@/types/webhookDelivery";

const MS_72H = 72 * 60 * 60 * 1000;

function statusBadgeVariant(status: WebhookDeliveryStatus): {
  variant: "secondary" | "default" | "destructive" | "outline";
  className?: string;
} {
  switch (status) {
    case "pending":
      return { variant: "secondary" };
    case "processing":
      return {
        variant: "default",
        className:
          "bg-sky-600/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200 border-transparent",
      };
    case "delivered":
      return {
        variant: "outline",
        className:
          "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-200",
      };
    case "failed":
      return { variant: "destructive" };
    default:
      return { variant: "secondary" };
  }
}

function payloadLikelyExpired(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && Date.now() - created > MS_72H;
}

export interface WebhookDeliveryTableProps {
  deliveries: WebhookDelivery[];
  isLoading: boolean;
  retryingDeliveryId: string | null;
  onRetry: (deliveryId: string) => void;
}

export function WebhookDeliveryTable({
  deliveries,
  isLoading,
  retryingDeliveryId,
  onRetry,
}: WebhookDeliveryTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-label="Loading deliveries" />
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="rounded-md border py-12 text-center text-muted-foreground">
        No webhook deliveries match the current filters.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Event type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
              <TableHead>Last attempted</TableHead>
              <TableHead className="max-w-[220px]">Error</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => {
              const badge = statusBadgeVariant(d.status);
              const expiredGuess = payloadLikelyExpired(d.createdAt);
              const showExpiredHint = d.status === "failed" && expiredGuess;

              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium capitalize">{d.provider}</TableCell>
                  <TableCell className="font-mono text-sm">{d.eventType}</TableCell>
                  <TableCell>
                    <Badge variant={badge.variant} className={badge.className}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.attempts}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.lastAttemptedAt ? formatDistanceToNow(d.lastAttemptedAt) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    {d.lastError ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="line-clamp-2 cursor-default text-sm text-destructive">
                            {d.lastError}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          <p className="whitespace-pre-wrap">{d.lastError}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {d.status === "failed" ? (
                      showExpiredHint ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Button size="sm" variant="outline" disabled className="gap-1">
                                <RefreshCw className="size-3.5" />
                                Retry
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Payload may have expired — retry unavailable via API
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={retryingDeliveryId === d.id}
                          onClick={() => onRetry(d.id)}
                        >
                          {retryingDeliveryId === d.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          Retry
                        </Button>
                      )
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
