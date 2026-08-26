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
  ProjectFilterDropdown,
  MemberPeriodSelect,
  MEMBER_PERIOD_LABELS,
  type MemberPeriod,
  type ToolUsageData,
  MemberUsageTable,
} from "@/components/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "@/components/ui/skeletons";
import { humanizeToolName } from "@/lib/utils";
import { formatTokens, formatPercent, formatCount } from "@/lib/formatters";
import { SHOW_PROMPT_INSIGHTS_SECTION_IN_PERSONAL_DASHBOARD } from "@/lib/featureFlags";

export function MemberDashboard({
  hideHeader = false,
  period: periodProp,
  projectId,
}: {
  hideHeader?: boolean;
  period?: MemberPeriod;
  projectId?: string;
}) {
  const { currentOrg } = useOrg();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();

  const orgId = currentOrg?.id ?? "";
  const userId = currentUser?.id ?? "";

  // Controlled by OrgDashboard's header when embedded; self-managed standalone.
  const [internalPeriod, setInternalPeriod] = useState<MemberPeriod>("30d");
  const period = periodProp ?? internalPeriod;
  const [internalProjectId, setInternalProjectId] = useState<string | undefined>();

  // Reset the standalone project filter when the org changes — a project UUID from
  // the previous org would otherwise be sent under the new org and 404. Embedded mode
  // is handled by the parent (OrgDashboard), which owns the scope there.
  const [prevOrgId, setPrevOrgId] = useState(orgId);
  if (orgId !== prevOrgId) {
    setPrevOrgId(orgId);
    if (!hideHeader) setInternalProjectId(undefined);
  }

  // When hideHeader, parent owns project scope (even when the value is undefined =
  // "All Projects"). Standalone mode manages its own project filter state.
  const resolvedProjectId = hideHeader ? projectId : internalProjectId;

  const { data: stats, isLoading: isLoadingStats } = useMemberDashboardStats(
    orgId,
    userId,
    period,
    resolvedProjectId,
  );
  const { data: heatmapData } = useMemberHeatmap(orgId, userId, resolvedProjectId);

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

  return (
    <div className="space-y-6">
      {/* When embedded (hideHeader), OrgDashboard's header owns the filter bar so
          the project/period controls sit in the same place as the Team tab. */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="type-h2">My Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Your personal AI tool usage for {currentOrg?.name || "your organization"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ProjectFilterDropdown
              orgId={orgId}
              value={internalProjectId}
              onChange={setInternalProjectId}
            />
            <MemberPeriodSelect value={period} onChange={setInternalPeriod} />
          </div>
        </div>
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
              description={`Last ${MEMBER_PERIOD_LABELS[period]}`}
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
              description={`Last ${MEMBER_PERIOD_LABELS[period]}`}
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

      {SHOW_PROMPT_INSIGHTS_SECTION_IN_PERSONAL_DASHBOARD ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <PromptInsightsSection orgId={orgId} userId={userId} period={period} projectId={resolvedProjectId} />
          <TopToolsChart data={toolUsage} isLoading={isLoadingStats} />
        </div>
      ) : (
        <TopToolsChart data={toolUsage} isLoading={isLoadingStats} />
      )}

      {heatmapData ? (
        <ActivityHeatmap data={heatmapData} summaryMode="last_year" />
      ) : (
        <Skeleton className="h-32 w-full" />
      )}

      <MemberUsageTable
        toolBreakdown={stats?.tool_breakdown ?? []}
        modelBreakdown={stats?.model_breakdown ?? []}
        isLoading={isLoadingStats}
      />
    </div>
  );
}
