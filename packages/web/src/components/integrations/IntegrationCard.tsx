import {
  MoreHorizontal,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Unplug,
  FlaskConical,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, formatDistanceToNow } from '@/lib/utils';
import { ProviderLogo } from '@/components/icons';

export type IntegrationProvider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'jira'
  | 'linear'
  | 'slack'
  | 'figma'
  | 'claude'
  | 'claude-code'
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'gemini'
  | 'cursor'
  | 'copilot'
  | 'google';

export interface IntegrationData {
  id: string;
  provider: IntegrationProvider;
  name: string;
  status: 'connected' | 'error' | 'syncing' | 'disconnected';
  last_sync_at?: string;
  sync_error?: string;
  metadata?: {
    account_name?: string;
    resources_count?: number;
  };
}

export interface ProviderInfo {
  id: IntegrationProvider;
  name: string;
  description: string;
  category: 'code' | 'project' | 'ai' | 'design' | 'communication';
  features: string[];
  available: boolean;
  comingSoon?: boolean;
}

interface IntegrationCardProps {
  integration?: IntegrationData;
  provider?: ProviderInfo;
  onSync?: (id: string) => void;
  onTest?: (id: string) => void;
  onDisconnect?: (id: string) => void;
  onConnect?: (providerId: string) => void;
  className?: string;
}

const statusConfig = {
  connected: {
    label: 'Connected',
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'bg-success/10',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
  },
  syncing: {
    label: 'Syncing',
    icon: RefreshCw,
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  disconnected: {
    label: 'Disconnected',
    icon: Unplug,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
  },
};

export function IntegrationCard({
  integration,
  provider,
  onSync,
  onTest,
  onDisconnect,
  onConnect,
  className,
}: IntegrationCardProps) {
  // Display as available provider to connect
  if (provider && !integration) {
    return (
      <Card
        className={cn(
          'group relative transition-all hover:shadow-md',
          !provider.available && 'opacity-60',
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
            {provider.available ? 'Connect' : 'Coming Soon'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Display as connected integration
  if (!integration) return null;

  const status = statusConfig[integration.status];
  const StatusIcon = status.icon;

  return (
    <Card className={cn('group relative transition-all hover:shadow-md', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <ProviderLogo provider={integration.provider} size="md" showBackground />
            <div>
              <CardTitle className="text-base">{integration.name}</CardTitle>
              <CardDescription className="text-xs capitalize">
                {integration.provider.replace('-', ' ')}
                {integration.metadata?.account_name &&
                  ` · ${integration.metadata.account_name}`}
              </CardDescription>
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
                <DropdownMenuItem onClick={() => onTest(integration.id)}>
                  <FlaskConical className="mr-2 size-4" />
                  Send test message
                </DropdownMenuItem>
              )}
              {(onSync || onTest) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDisconnect?.(integration.id)}
              >
                <Unplug className="mr-2 size-4" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('gap-1', status.bg)}>
              <StatusIcon
                className={cn(
                  'size-3',
                  status.color,
                  integration.status === 'syncing' && 'animate-spin'
                )}
              />
              <span className={status.color}>{status.label}</span>
            </Badge>
          </div>
          {integration.metadata?.resources_count !== undefined && (
            <span className="text-xs text-muted-foreground">
              {integration.metadata.resources_count} resources
            </span>
          )}
        </div>

        {integration.last_sync_at && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            Last synced {formatDistanceToNow(integration.last_sync_at)}
          </div>
        )}

        {integration.sync_error && (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {integration.sync_error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
