import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useUpdateConnector } from "@/hooks/useApi";

interface OpenrouterWebhookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhookActive: boolean;
  webhookToken?: string;
  webhookSecretSet?: boolean;
  connectorId: string;
}

export function OpenrouterWebhookSheet({
  open,
  onOpenChange,
  webhookActive,
  webhookToken,
  webhookSecretSet,
  connectorId,
}: OpenrouterWebhookSheetProps) {
  const { currentOrg } = useOrg();
  const updateConnector = useUpdateConnector();

  const [copied, setCopied] = useState(false);
  const [secret, setSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  // Track locally after save so UI updates without closing the sheet
  const [secretSetLocally, setSecretSetLocally] = useState(false);
  const isSecretSet = secretSetLocally || webhookSecretSet;

  const webhookUrl = webhookToken
    ? `${window.location.origin}/api/v1/webhooks/openrouter_traces/${webhookToken}`
    : null;

  const handleCopy = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSecret = async () => {
    if (!secret.trim()) return;
    if (!currentOrg) {
      setSecretError("Organization context not available. Please reload the page.");
      return;
    }
    setSecretError(null);
    try {
      await updateConnector.mutateAsync({
        orgId: currentOrg.id,
        connectorId,
        data: { webhook_secret: secret.trim() },
      });
      setSecretSaved(true);
      setSecretSetLocally(true);
      setSecret("");
      setTimeout(() => setSecretSaved(false), 3000);
    } catch (err) {
      console.error("[OpenrouterWebhookSheet] Failed to save webhook secret:", err);
      const message = err instanceof Error ? err.message : "Failed to save. Please try again.";
      setSecretError(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
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
                  Aixle Insights is receiving per-request telemetry from OpenRouter. Each
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

          <ol className="space-y-5 text-sm">
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
                {webhookUrl ? (
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
                ) : (
                  <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Loading webhook URL…
                  </div>
                )}
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                4
              </span>
              <div className="w-full pt-0.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-muted-foreground" />
                  <p>
                    Protect with a secret{" "}
                    <span className="text-xs text-muted-foreground">(recommended)</span>
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create any secret string, then add it to OpenRouter's{" "}
                  <strong>Headers</strong> field as{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono">
                    {"{"}"X-Webhook-Secret": "your-secret"{"}"}
                  </code>
                  . Aixle Insights will reject requests where this header is missing or wrong.
                </p>
                {isSecretSet && !secretSaved && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
                    <ShieldCheck className="size-3.5" />
                    <span>Secret is set</span>
                    <span className="text-muted-foreground">— enter a new value below to replace it</span>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="webhook-secret" className="sr-only">
                      Secret
                    </Label>
                    <Input
                      id="webhook-secret"
                      type="password"
                      placeholder={isSecretSet ? "Replace existing secret…" : "Enter the secret you set in OpenRouter"}
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={secretSaved ? "outline" : "default"}
                    className="h-8 shrink-0"
                    disabled={!secret.trim() || updateConnector.isPending}
                    onClick={handleSaveSecret}
                  >
                    {secretSaved ? (
                      <>
                        <Check className="mr-1.5 size-3.5 text-success" />
                        Saved
                      </>
                    ) : updateConnector.isPending ? (
                      "Saving…"
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                {secretError && (
                  <p className="mt-1.5 text-xs text-destructive">{secretError}</p>
                )}
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                5
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
