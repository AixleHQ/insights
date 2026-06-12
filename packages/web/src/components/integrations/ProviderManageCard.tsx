import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ProviderLogo } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { IntegrationProvider, ProviderInfo } from "@/lib/providers";

interface ProviderManageCardProps {
  provider: ProviderInfo;
  enabled: boolean;
  onToggle: (provider: IntegrationProvider, enabled: boolean) => void;
  isPending?: boolean;
}

export function ProviderManageCard({ provider, enabled, onToggle, isPending }: ProviderManageCardProps) {
  const isToggleable = !provider.comingSoon;

  return (
    <Card className={cn("transition-opacity", !enabled && "opacity-60")}>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
          <ProviderLogo provider={provider.id} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium leading-none">{provider.name}</span>
            {provider.comingSoon && (
              <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {provider.description}
          </p>
        </div>
        <Switch
          checked={isToggleable ? enabled : true}
          disabled={!isToggleable || isPending}
          onCheckedChange={(checked) => onToggle(provider.id, checked)}
          aria-label={provider.comingSoon ? `${provider.name} — coming soon` : `${enabled ? "Disable" : "Enable"} ${provider.name}`}
        />
      </CardContent>
    </Card>
  );
}
