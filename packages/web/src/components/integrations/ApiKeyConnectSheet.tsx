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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderLogo } from "@/components/icons";
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
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
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
