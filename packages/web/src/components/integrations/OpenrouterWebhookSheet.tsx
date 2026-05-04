import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Check, Copy, ExternalLink, Zap } from "lucide-react";

interface OpenrouterWebhookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhookActive: boolean;
}

export function OpenrouterWebhookSheet({
  open,
  onOpenChange,
  webhookActive,
}: OpenrouterWebhookSheetProps) {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/v1/webhooks/openrouter_traces`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            OpenRouter Webhook Setup
          </SheetTitle>
          <SheetDescription>
            Enable per-request tracking instead of daily aggregates by
            connecting the OpenRouter Broadcast Webhook.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-1">
          {webhookActive ? (
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <div>
                <p className="font-medium text-success">Webhook is active</p>
                <p className="mt-0.5 text-muted-foreground">
                  DB90 is receiving per-request telemetry from OpenRouter. Each
                  API call is tracked individually.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <Zap className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Webhook not configured
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Currently syncing daily aggregates only. Follow the steps
                  below to enable real-time per-request tracking.
                </p>
              </div>
            </div>
          )}

          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                1
              </span>
              <div className="pt-0.5">
                <p>Open OpenRouter Observability settings</p>
                <a
                  href="https://openrouter.ai/settings/observability"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                >
                  openrouter.ai/settings/observability
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                2
              </span>
              <div className="pt-0.5">
                <p>Enable Broadcast and add a Webhook destination</p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                3
              </span>
              <div className="w-full pt-0.5">
                <p>Set the webhook URL to:</p>
                <div className="mt-2 flex items-stretch overflow-hidden rounded-md border bg-muted font-mono text-xs">
                  <code className="flex-1 break-all px-3 py-2 leading-relaxed">
                    {webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 border-l px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Copy webhook URL"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                4
              </span>
              <div className="pt-0.5">
                <p>Save and send a test request to verify the connection</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The badge on this integration will switch to{" "}
                  <span className="font-medium text-success">Webhook active</span>{" "}
                  automatically after the first successful delivery.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
