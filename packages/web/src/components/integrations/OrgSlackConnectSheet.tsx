import { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useConnectWithWebhook } from "@/hooks/useApi";
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

interface OrgSlackConnectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function OrgSlackConnectSheet({ open, onOpenChange, onSuccess }: OrgSlackConnectSheetProps) {
  const { currentOrg } = useOrg();
  const connectWithWebhook = useConnectWithWebhook();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelLabel, setChannelLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setWebhookUrl("");
      setChannelLabel("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await connectWithWebhook.mutateAsync({
        orgId: currentOrg.id,
        webhookUrl,
        channelLabel: channelLabel.trim() || undefined,
      });
      setWebhookUrl("");
      setChannelLabel("");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const data = err.data as { errors?: { access_token?: string[] } } | null;
        setError(data?.errors?.access_token?.[0] ?? "Invalid webhook URL");
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
            <ProviderLogo provider="slack" size="md" showBackground />
            <div>
              <SheetTitle>Connect Slack</SheetTitle>
              <SheetDescription>Receive alerts and notifications in Slack</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">
              Webhook URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              autoComplete="off"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-label">
              Channel label{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="channel-label"
              type="text"
              placeholder="#general"
              value={channelLabel}
              onChange={(e) => setChannelLabel(e.target.value)}
            />
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
            disabled={isSubmitting || !webhookUrl.trim()}
          >
            {isSubmitting ? "Connecting…" : "Connect"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
