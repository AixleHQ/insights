import React, { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useConnectWithApiKey } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderLogo } from "@/components/icons";
import { Check, Copy, ExternalLink, Zap } from "lucide-react";
import type { ProviderInfo } from "./IntegrationCard";

interface ApiKeyConnectSheetProps {
  provider: ProviderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Optional override for the connect action. When provided, org context is not used. */
  onConnect?: (apiKey: string) => Promise<void>;
}

export function ApiKeyConnectSheet({
  provider,
  open,
  onOpenChange,
  onSuccess,
  onConnect,
}: ApiKeyConnectSheetProps) {
  const { currentOrg } = useOrg();
  const connectWithApiKey = useConnectWithApiKey();

  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/v1/webhooks/openrouter_traces`;

  const handleCopyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const isOpenRouter = provider?.id === "openrouter";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setApiKey("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;

    setError(null);
    setIsSubmitting(true);

    try {
      if (onConnect) {
        await onConnect(apiKey);
      } else {
        if (!currentOrg) return;
        await connectWithApiKey.mutateAsync({
          orgId: currentOrg.id,
          connectorType: provider.id,
          apiKey,
        });
      }
      setApiKey("");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const data = err.data as { errors?: { access_token?: string[] } } | null;
        setError(data?.errors?.access_token?.[0] ?? "Invalid API key");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <div className="flex items-center gap-3">
            {provider && (
              <ProviderLogo provider={provider.id} size="md" showBackground />
            )}
            <div>
              <SheetTitle>{provider?.name}</SheetTitle>
              <SheetDescription>{provider?.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">{provider?.inputLabel ?? "API Key"}</Label>
            <Input
              id="api-key"
              type="password"
              placeholder={provider?.inputPlaceholder ?? "Enter your API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            {isOpenRouter && (
              <p className="text-sm text-muted-foreground">
                Use an OpenRouter management key for usage sync. Standard API keys can proxy model
                requests, but they cannot fetch activity data for the dashboard.
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {isOpenRouter && (
            <Alert>
              <Zap className="size-4" />
              <AlertTitle>Enable per-request tracking</AlertTitle>
              <AlertDescription>
                <p>
                  After connecting, set up the OpenRouter Broadcast Webhook to
                  get real-time per-request data instead of daily aggregates.
                </p>
                <ol className="mt-2 space-y-2 list-decimal list-inside">
                  <li>
                    Open{" "}
                    <a
                      href="https://openrouter.ai/settings/observability"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 underline underline-offset-2"
                    >
                      OpenRouter → Settings → Observability
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                  <li>Enable Broadcast and add a Webhook destination</li>
                  <li className="list-item">
                    <span>Set the URL to:</span>
                    <div className="mt-1 flex items-stretch rounded bg-muted text-xs font-mono">
                      <code className="flex-1 break-all px-2 py-1.5">
                        {webhookUrl}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyWebhookUrl}
                        className="shrink-0 border-l border-border px-2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Copy webhook URL"
                      >
                        {copied ? (
                          <Check className="size-3.5 text-green-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </li>
                  <li>Save and send a test request to verify</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
        </form>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !apiKey.trim()}
          >
            {isSubmitting ? "Connecting…" : "Connect"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
