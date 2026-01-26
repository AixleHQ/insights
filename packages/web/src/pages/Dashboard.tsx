import { useState, useEffect } from 'react';
import { Activity, DollarSign, AlertTriangle, Users } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useOverviewStats, useDailyStats, useEvents, useActivityHeatmap } from '@/hooks/useApi';
import {
  MetricCard,
  MetricGrid,
  CostTrendChart,
  ActivityFeed,
  TopToolsChart,
  AlertsPanel,
  ActivityHeatmap,
  type DailyCostData,
  type ActivityEvent,
  type ToolUsageData,
  type Alert,
} from '@/components/dashboard';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';

export function Dashboard() {
  const { currentOrg } = useOrg();

  // Fetch data using TanStack Query
  const {
    data: stats,
    isLoading: isLoadingStats,
  } = useOverviewStats(currentOrg?.id || '');

  const {
    data: dailyData,
    isLoading: isLoadingDaily,
  } = useDailyStats(currentOrg?.id || '', 30);

  const {
    data: eventsResponse,
    isLoading: isLoadingEvents,
  } = useEvents(currentOrg?.id || '', { per_page: 10 });

  const {
    data: heatmapData,
    isLoading: isLoadingHeatmap,
  } = useActivityHeatmap(currentOrg?.id || '');

  // Transform API responses to component formats
  const chartData: DailyCostData[] = dailyData?.data?.map((d) => ({
    date: d.date,
    cost: d.cost_usd,
    events: d.event_count,
  })) || [];

  const toolUsage: ToolUsageData[] = dailyData?.tool_breakdown?.map((t) => ({
    tool_name: t.tool_name,
    event_count: t.event_count,
    total_cost: t.cost_usd,
  })) || [];

  const events: ActivityEvent[] = eventsResponse?.data?.map((e) => ({
    id: e.id,
    tool_name: e.toolName,
    event_type: e.eventType,
    risk_level: e.riskLevel,
    cost_usd: e.costUsd,
    created_at: e.occurredAt || e.createdAt,
    user: e.user ? { email: e.user.email } : undefined,
    project: e.project ? { name: e.project.name } : undefined,
  })) || [];

  // Track dismissed alerts in local storage (per organization)
  const dismissedAlertsKey = `db90_dismissed_alerts_${currentOrg?.id}`;
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(dismissedAlertsKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Sync dismissed alerts to localStorage
  useEffect(() => {
    if (currentOrg?.id) {
      localStorage.setItem(dismissedAlertsKey, JSON.stringify([...dismissedAlerts]));
    }
  }, [dismissedAlerts, dismissedAlertsKey, currentOrg?.id]);

  // Derive alerts from stats
  const alerts: Alert[] = stats?.high_risk_events && stats.high_risk_events > 0
    ? [
        {
          id: 'high-risk-events',
          type: 'risk_detected',
          severity: 'warning',
          title: 'High-risk events detected',
          description: `${stats.high_risk_events} high-risk event(s) require attention`,
          created_at: new Date().toISOString(),
          acknowledged: dismissedAlerts.has('high-risk-events'),
        },
      ]
    : [];

  const handleDismissAlert = (id: string) => {
    setDismissedAlerts((prev) => new Set([...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          AI tool usage and cost overview for {currentOrg?.name || 'your organization'}
        </p>
      </div>

      {isLoadingHeatmap ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-24" />
            <div className="flex gap-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="flex">
            <div className="w-7 shrink-0" />
            <div className="flex-1 grid grid-cols-[repeat(53,1fr)] gap-1">
              {Array.from({ length: 53 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Skeleton key={j} className="aspect-square w-full rounded" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <TooltipProvider>
          <ActivityHeatmap data={heatmapData || []} />
        </TooltipProvider>
      )}

      <MetricGrid>
        <MetricCard
          title="Total Events"
          value={stats?.total_events ?? 0}
          format="number"
          icon={<Activity className="size-5" />}
          trend={
            stats?.events_change_percent
              ? stats.events_change_percent > 0
                ? 'up'
                : 'down'
              : 'neutral'
          }
          trendValue={
            stats?.events_change_percent
              ? `${Math.abs(stats.events_change_percent).toFixed(1)}%`
              : undefined
          }
          description="This month"
        />
        <MetricCard
          title="Total Cost"
          value={stats?.total_cost_usd ?? 0}
          format="currency"
          icon={<DollarSign className="size-5" />}
          trend={
            stats?.cost_change_percent
              ? stats.cost_change_percent > 0
                ? 'up'
                : 'down'
              : 'neutral'
          }
          trendValue={
            stats?.cost_change_percent
              ? `${Math.abs(stats.cost_change_percent).toFixed(1)}%`
              : undefined
          }
          description="This month"
        />
        <MetricCard
          title="High-Risk Events"
          value={stats?.high_risk_events ?? 0}
          format="number"
          icon={<AlertTriangle className="size-5" />}
          description="Requiring attention"
        />
        <MetricCard
          title="Active Users"
          value={stats?.active_users ?? 0}
          format="number"
          icon={<Users className="size-5" />}
          description="Last 7 days"
        />
      </MetricGrid>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CostTrendChart data={chartData} isLoading={isLoadingDaily} />
        <ActivityFeed events={events} isLoading={isLoadingEvents} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TopToolsChart data={toolUsage} isLoading={isLoadingDaily} />
        <AlertsPanel
          alerts={alerts}
          isLoading={isLoadingStats}
          onDismiss={handleDismissAlert}
        />
      </div>
    </div>
  );
}
