import { useState } from "react";
import { Activity, DollarSign, Coins } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrentUser, useMemberDashboardStats, useMemberHeatmap } from "@/hooks/useApi";
import {
  MetricCard,
  MetricGrid,
  TopToolsChart,
  ActivityHeatmap,
  type ToolUsageData,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTokens } from "@/lib/formatters";

const PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export function MemberDashboard() {
  const { currentOrg } = useOrg();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();

  const orgId = currentOrg?.id ?? "";
  const userId = currentUser?.id ?? "";

  const [period, setPeriod] = useState<Period>("30d");

  const { data: stats, isLoading: isLoadingStats } = useMemberDashboardStats(orgId, userId, period);
  const { data: heatmapData } = useMemberHeatmap(orgId, userId);

  if (!currentUser && isLoadingUser) {
    return <Skeleton className="h-96 w-full" />;
  }

  const toolUsage: ToolUsageData[] = stats?.tool_breakdown?.map((t) => ({
    tool_name: t.tool_name,
    event_count: t.event_count,
    total_cost: t.cost_usd,
  })) ?? [];

  const totalTokens = (stats?.total_tokens_in ?? 0) + (stats?.total_tokens_out ?? 0);
  const totalHeatmapEvents = heatmapData?.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your personal AI tool usage for {currentOrg?.name || "your organization"}
          </p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      <MetricGrid>
        <MetricCard
          title="Total Events"
          value={stats?.total_events ?? 0}
          format="number"
          icon={<Activity className="size-5" />}
          trend={
            stats?.events_change_percent
              ? stats.events_change_percent > 0
                ? "up"
                : "down"
              : "neutral"
          }
          trendValue={
            stats?.events_change_percent
              ? `${Math.abs(stats.events_change_percent).toFixed(1)}%`
              : undefined
          }
          description={`Last ${PERIOD_LABELS[period]}`}
        />
        <MetricCard
          title="Total Cost"
          value={stats?.total_cost_usd ?? 0}
          format="currency"
          icon={<DollarSign className="size-5" />}
          trend={
            stats?.cost_change_percent
              ? stats.cost_change_percent > 0
                ? "up"
                : "down"
              : "neutral"
          }
          trendValue={
            stats?.cost_change_percent
              ? `${Math.abs(stats.cost_change_percent).toFixed(1)}%`
              : undefined
          }
          description={`Last ${PERIOD_LABELS[period]}`}
        />
        <MetricCard
          title="Total Tokens"
          value={totalTokens}
          format="compact"
          icon={<Coins className="size-5" />}
          trend={
            stats?.tokens_change_percent
              ? stats.tokens_change_percent > 0
                ? "up"
                : "down"
              : "neutral"
          }
          trendValue={
            stats?.tokens_change_percent
              ? `${Math.abs(stats.tokens_change_percent).toFixed(1)}%`
              : undefined
          }
          description={`${formatTokens(stats?.total_tokens_in ?? 0)} in / ${formatTokens(stats?.total_tokens_out ?? 0)} out`}
        />
        <div className="opacity-60 pointer-events-none">
          <MetricCard
            title="Prompt Quality"
            value="—"
            description="Coming soon"
          />
        </div>
      </MetricGrid>

      <div>
        <p className="text-sm text-muted-foreground mb-2">
          {totalHeatmapEvents.toLocaleString()} events in the last year
        </p>
        {heatmapData ? (
          <ActivityHeatmap data={heatmapData} className="col-span-full" />
        ) : (
          <Skeleton className="h-32 w-full" />
        )}
      </div>

      <section>
        <h2 className="text-base font-semibold mb-3">Usage by Tool</h2>
        <TopToolsChart data={toolUsage} isLoading={isLoadingStats} />
      </section>
    </div>
  );
}
