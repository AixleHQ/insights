import { useState } from "react";
import { Activity, DollarSign, Coins, Wrench } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrentUser, useMemberDashboardStats, useMemberHeatmap } from "@/hooks/useApi";
import {
  MetricCard,
  MetricGrid,
  TopToolsChart,
  ActivityHeatmap,
  PromptInsightsSection,
  type ToolUsageData,
} from "@/components/dashboard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "@/components/ui/skeletons";
import { humanizeToolName } from "@/lib/utils";
import { formatTokens, formatPercent, formatCount } from "@/lib/formatters";

const PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export function MemberDashboard({ hideHeader = false }: { hideHeader?: boolean }) {
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

  const topTool = toolUsage.length > 0
    ? toolUsage.reduce((a, b) => (b.event_count > a.event_count ? b : a))
    : null;

  const totalTokens = (stats?.total_tokens_in ?? 0) + (stats?.total_tokens_out ?? 0);

  const periodButtons = (
    <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
      <TabsList>
        {PERIODS.map((p) => (
          <TabsTrigger key={p} value={p}>
            {PERIOD_LABELS[p]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-6">
      {!hideHeader ? (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="type-h2">My Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Your personal AI tool usage for {currentOrg?.name || "your organization"}
            </p>
          </div>
          {periodButtons}
        </div>
      ) : (
        <div className="flex justify-end">{periodButtons}</div>
      )}

      <MetricGrid className="lg:grid-cols-4 xl:grid-cols-4">
        {isLoadingStats ? (
          <>
            <StatCardSkeleton showDescription />
            <StatCardSkeleton showDescription />
            <StatCardSkeleton showDescription />
            <StatCardSkeleton showDescription />
          </>
        ) : (
          <>
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
                  ? formatPercent(Math.abs(stats.events_change_percent))
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
                  ? formatPercent(Math.abs(stats.cost_change_percent))
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
                  ? formatPercent(Math.abs(stats.tokens_change_percent))
                  : undefined
              }
              description={`${formatTokens(stats?.total_tokens_in ?? 0)} in / ${formatTokens(stats?.total_tokens_out ?? 0)} out`}
            />
            <MetricCard
              title="Top Tool"
              value={topTool ? humanizeToolName(topTool.tool_name) : "—"}
              icon={<Wrench className="size-5" />}
              description={
                topTool
                  ? `${formatCount(topTool.event_count)} events · ${formatPercent((topTool.event_count / (stats?.total_events ?? 1)) * 100)} of total`
                  : "No data yet"
              }
            />
          </>
        )}
      </MetricGrid>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PromptInsightsSection orgId={orgId} userId={userId} period={period} />
        <TopToolsChart data={toolUsage} isLoading={isLoadingStats} />
      </div>

      {heatmapData ? (
        <ActivityHeatmap data={heatmapData} />
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
    </div>
  );
}
