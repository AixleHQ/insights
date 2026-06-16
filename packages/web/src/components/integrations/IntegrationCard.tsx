import { useState } from "react";
import {
  MoreHorizontal,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Unplug,
  FlaskConical,
  ChevronDown,
  KeyRound,
  Zap,
  Pencil,
  Building2,
  FolderKanban,
  User,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatDistanceToNow } from "@/lib/utils";
import { ProviderLogo } from "@/components/icons";
import type { ConnectorStatus, ConnectorHealthStats } from "@/lib/types";
import { formatPercentage } from "@/lib/formatters";
import type { IntegrationScope, IntegrationProvider, ProviderInfo } from "@/lib/providers";

export type { IntegrationScope, IntegrationProvider, ProviderInfo };

export interface IntegrationData {
  id: string;
  provider: IntegrationProvider;
  name: string;
  status: ConnectorStatus;
  last_sync_at?: string;
  last_event_at?: string;
  sync_error?: string;
  label?: string | null;
  metadata?: {
    account_name?: string;
    resources_count?: number;
    event_count?: number;
  };
  // GitHub Copilot-specific fields (camelCase, from Alba serializer)
  copilotConnector?: boolean;
  seatCount?: number | null;
  activeUsersCount?: number | null;
  // OpenRouter-specific
  webhookActive?: boolean;
  webhookToken?: string;
  webhookSecretSet?: boolean;
  scope?: IntegrationScope;
}

interface IntegrationCardProps {
  integration?: IntegrationData;
  provider?: ProviderInfo;
  healthStats?: ConnectorHealthStats | null;
  onSync?: (id: string) => void;
  onTest?: (id: string) => void;
  onDisconnect?: (id: string) => void;
  onRename?: (id: string, newLabel: string) => void;
  onRegenerateToken?: (id: string) => void;
  onConnect?: (providerId: string) => void;
  onSetupWebhook?: (id: string) => void;
  isTesting?: boolean;
  className?: string;
}

const scopeConfig: Record<IntegrationScope, { label: string; Icon: LucideIcon }> = {
  org: { label: "Org", Icon: Building2 },
  project: { label: "Project", Icon: FolderKanban },
  persona: { label: "Personal", Icon: User },
};

function ScopeBadge({ scope }: { scope: IntegrationScope }) {
  const { label, Icon } = scopeConfig[scope];
  return (
    <Badge variant="secondary" className="gap-1 text-xs font-normal">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

const statusConfig = {
  connected: {
    label: "Connected",
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10",
  },
  testing: {
    label: "Testing",
    icon: RefreshCw,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  disconnected: {
    label: "Disconnected",
    icon: Unplug,
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
};

function ErrorPanel({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/5 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-destructive"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <AlertCircle className="size-3 shrink-0" />
        <span className="flex-1 truncate text-left font-medium">Last error</span>
        <ChevronDown
          className={cn("size-3 shrink-0 transition-transform duration-150", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="border-t border-destructive/20 px-3 py-2">
          <p className="break-all font-mono text-destructive/80">{error}</p>
        </div>
      )}
    </div>
  );
}

export function IntegrationCard({
  integration,
  provider,
  healthStats,
  onSync,
  onTest,
  onDisconnect,
  onRename,
  onRegenerateToken,
  onConnect,
  onSetupWebhook,
  isTesting = false,
  className,
}: IntegrationCardProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  // Display as available provider to connect
  if (provider && !integration) {
    return (
      <Card
        data-testid={`provider-card-${provider.id}`}
        className={cn(
          "group relative transition-all hover:shadow-md",
          !provider.available && "opacity-60",
          className
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ProviderLogo provider={provider.id} size="md" showBackground />
              <div>
                <CardTitle className="text-base">{provider.name}</CardTitle>
                <CardDescription className="text-xs">
                  {provider.description}
                </CardDescription>
              </div>
            </div>
            <ScopeBadge scope={provider.scope} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-xs text-muted-foreground">
            {provider.features.slice(0, 3).map((feature, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="size-1 rounded-full bg-muted-foreground" />
                {feature}
              </li>
            ))}
          </ul>
          <Button
            className="w-full"
            disabled={!provider.available}
            onClick={() => onConnect?.(provider.id)}
          >
            {provider.available ? "Connect" : "Coming Soon"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Display as connected integration
  if (!integration) return null;

  const status = statusConfig[integration.status];
  const StatusIcon = status.icon;
  const isSyncing = integration.status === "testing" && !isTesting;
  const statusLabel = isSyncing ? "Syncing…" : status.label;

  return (
    <Card className={cn("group relative transition-all hover:shadow-md", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <ProviderLogo provider={integration.provider} size="md" showBackground />
            <div>
              <CardTitle className="text-base">{integration.name}</CardTitle>
              <CardDescription className="text-xs capitalize">
                {integration.provider.replace("-", " ")}
                {integration.label && ` · ${integration.label}`}
                {!integration.label && integration.metadata?.account_name &&
                  ` · ${integration.metadata.account_name}`}
              </CardDescription>
              {integration.scope && (
                <div className="mt-1">
                  <ScopeBadge scope={integration.scope} />
                </div>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onSync && (
                <DropdownMenuItem onClick={() => onSync(integration.id)}>
                  <RefreshCw className="mr-2 size-4" />
                  Sync now
                </DropdownMenuItem>
              )}
              {onTest && (
                <DropdownMenuItem
                  onClick={() => onTest(integration.id)}
                  disabled={isTesting}
                >
                  <FlaskConical className="mr-2 size-4" />
                  Test connection
                </DropdownMenuItem>
              )}
              {onRegenerateToken && (
                <DropdownMenuItem onClick={() => onRegenerateToken(integration.id)}>
                  <KeyRound className="mr-2 size-4" />
                  Regenerate token
                </DropdownMenuItem>
              )}
              {onSetupWebhook && (
                <DropdownMenuItem onClick={() => onSetupWebhook(integration.id)}>
                  <Zap className="mr-2 size-4" />
                  Setup webhook
                </DropdownMenuItem>
              )}
              {onRename && (
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(integration.label ?? "");
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
              )}
              {(onSync || onTest || onRegenerateToken || onSetupWebhook || onRename) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDisconnect?.(integration.id)}
              >
                <Unplug className="mr-2 size-4" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Rename connector</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="rename-label">Label</Label>
                <Input
                  id="rename-label"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="e.g. Work account, Team A"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRename?.(integration.id, renameValue.trim());
                      setRenameOpen(false);
                    }
                  }}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenameOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    onRename?.(integration.id, renameValue.trim());
                    setRenameOpen(false);
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {isTesting ? (
              <Badge variant="outline" className="gap-1 bg-primary/10">
                <RefreshCw className="size-3 animate-spin text-primary" />
                <span className="text-primary">Testing…</span>
              </Badge>
            ) : (
              <Badge variant="outline" className={cn("gap-1", status.bg)}>
                <StatusIcon
                  className={cn("size-3", status.color, integration.status === "testing" && "animate-spin")}
                />
                <span className={status.color}>{statusLabel}</span>
              </Badge>
            )}
            {integration.webhookActive !== undefined && (
              integration.webhookActive ? (
                <Badge variant="outline" className="gap-1 bg-success/10">
                  <Zap className="size-3 text-success" />
                  <span className="text-success">Webhook active</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="cursor-pointer gap-1 bg-muted transition-colors hover:bg-warning/10"
                  onClick={() => onSetupWebhook?.(integration.id)}
                  title="Click to set up webhook for per-request tracking"
                >
                  <Zap className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Webhook inactive</span>
                </Badge>
              )
            )}
          </div>
          {integration.metadata?.resources_count !== undefined && (
            <span className="text-xs text-muted-foreground">
              {integration.metadata.resources_count} resources
            </span>
          )}
        </div>

        {integration.copilotConnector && integration.seatCount != null && (
          <div className="text-xs text-muted-foreground">
            {integration.seatCount} seats · {integration.activeUsersCount ?? 0} active
          </div>
        )}

        {integration.last_sync_at && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            Last synced {formatDistanceToNow(integration.last_sync_at)}
          </div>
        )}

        {integration.metadata?.event_count !== undefined && (
          <div className="text-xs text-muted-foreground">
            {integration.metadata.event_count} synced events
            {integration.last_event_at ? ` · latest activity ${formatDistanceToNow(integration.last_event_at)}` : ""}
          </div>
        )}

        {integration.sync_error && (
          <ErrorPanel error={integration.sync_error} />
        )}

        {healthStats && (healthStats.success_rate_7d != null || healthStats.avg_sync_duration_ms_7d != null) && (
          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            {healthStats.success_rate_7d != null && (
              <span
                className={cn(
                  "font-medium",
                  healthStats.success_rate_7d >= 0.9 ? "text-success" :
                  healthStats.success_rate_7d >= 0.7 ? "text-warning" :
                  "text-destructive"
                )}
              >
                {formatPercentage(healthStats.success_rate_7d)} success
              </span>
            )}
            {healthStats.success_rate_7d != null && healthStats.avg_sync_duration_ms_7d != null && (
              <span className="text-muted-foreground/40">·</span>
            )}
            {healthStats.avg_sync_duration_ms_7d != null && (
              <span>avg {(healthStats.avg_sync_duration_ms_7d / 1000).toFixed(1)}s</span>
            )}
            <span className="ml-auto opacity-60">7d</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
