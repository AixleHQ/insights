import { Link } from 'react-router-dom';
import { formatDistanceToNow } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  DollarSign,
  Shield,
  TrendingUp,
  Bell,
  X,
} from 'lucide-react';

export interface Alert {
  id: string;
  type: 'cost_threshold' | 'risk_detected' | 'usage_spike' | 'policy_violation';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  created_at: string;
  acknowledged: boolean;
}

interface AlertsPanelProps {
  alerts: Alert[];
  isLoading?: boolean;
  onDismiss?: (id: string) => void;
  className?: string;
}

const alertTypeIcons = {
  cost_threshold: DollarSign,
  risk_detected: Shield,
  usage_spike: TrendingUp,
  policy_violation: AlertTriangle,
};

const severityColors = {
  critical: {
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    icon: 'text-destructive',
  },
  warning: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: 'text-warning',
  },
  info: {
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    icon: 'text-primary',
  },
};

function AlertItem({
  alert,
  onDismiss,
}: {
  alert: Alert;
  onDismiss?: (id: string) => void;
}) {
  const Icon = alertTypeIcons[alert.type] || AlertTriangle;
  const colors = severityColors[alert.severity] || severityColors.info;
  const timeAgo = formatDistanceToNow(alert.created_at);

  return (
    <div
      className={cn(
        'group relative rounded-lg border p-3 transition-colors',
        colors.bg,
        colors.border,
        alert.acknowledged && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5', colors.icon)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{alert.title}</span>
            <Badge
              variant="outline"
              className={cn(
                'font-mono-display text-[10px] uppercase',
                alert.severity === 'critical' && 'border-destructive/50 text-destructive',
                alert.severity === 'warning' && 'border-warning/50 text-warning',
                alert.severity === 'info' && 'border-primary/50 text-primary'
              )}
            >
              {alert.severity}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{alert.description}</p>
          <p className="text-xs text-muted-foreground/60">{timeAgo}</p>
        </div>
        {onDismiss && !alert.acknowledged && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onDismiss(alert.id)}
          >
            <X className="size-3" />
            <span className="sr-only">Dismiss</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function AlertSkeleton() {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Skeleton className="size-4 rounded" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

export function AlertsPanel({ alerts, isLoading, onDismiss, className }: AlertsPanelProps) {
  const activeAlerts = alerts.filter((a) => !a.acknowledged);
  const hasAlerts = activeAlerts.length > 0;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Bell className={cn('size-4', hasAlerts ? 'text-warning' : 'text-muted-foreground')} />
          <div>
            <CardTitle className="text-base font-medium">Alerts</CardTitle>
            <CardDescription className="text-xs">
              {hasAlerts
                ? `${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''}`
                : 'No active alerts'}
            </CardDescription>
          </div>
        </div>
        {hasAlerts && (
          <Link
            to="/settings/alerts"
            className="text-xs font-medium text-primary hover:underline"
          >
            Manage
          </Link>
        )}
      </CardHeader>
      <CardContent className="px-2">
        <ScrollArea className="h-[200px] pr-4">
          {isLoading ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <AlertSkeleton key={i} />
              ))}
            </div>
          ) : activeAlerts.length === 0 ? (
            <div className="flex h-[150px] flex-col items-center justify-center text-center">
              <div className="mb-2 rounded-full bg-muted p-3">
                <Bell className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">All clear</p>
              <p className="text-xs text-muted-foreground/60">No alerts to show</p>
            </div>
          ) : (
            <div className="space-y-2 px-2">
              {activeAlerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} onDismiss={onDismiss} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
