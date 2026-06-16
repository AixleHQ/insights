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
import { Zap } from "lucide-react";
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
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isOpenRouter = provider?.id === "openrouter";
  const isMultiInstance = provider?.multiInstance ?? false;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setApiKey("");
      setLabel("");
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
          ...(label.trim() ? { label: label.trim() } : {}),
        });
      }
      setApiKey("");
      setLabel("");
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
            {isMultiInstance && (
              <div className="space-y-1 pt-1">
                <Label htmlFor="connector-label">Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="connector-label"
                  type="text"
                  placeholder="e.g. Production key, Team A"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Helps you tell multiple connections of this provider apart.
                </p>
              </div>
            )}
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
                After connecting, use <strong>Setup webhook</strong> from the
                integration menu to get a unique webhook URL and configure
                real-time per-request tracking in OpenRouter.
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
