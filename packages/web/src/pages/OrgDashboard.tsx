import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, DollarSign, AlertTriangle, Users } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useOverviewStats, useDailyStats, useEvents, useProjects } from "@/hooks/useApi";
import {
  MetricCard,
  MetricGrid,
  CostTrendChart,
  ActivityFeed,
  TopToolsChart,
  ToolInsightsSection,
  WeeklyToolUsageChart,
  RiskAlertsTable,
  type DailyCostData,
  type ActivityEvent,
  type ToolUsageData,
} from "@/components/dashboard";
import { EventDrawer } from "@/components/events";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberDashboard } from "@/pages/MemberDashboard";
import { StatCardSkeleton } from "@/components/ui/skeletons";
import { formatPercent, periodLabel } from "@/lib/formatters";
import { type DashboardPeriod } from "@/lib/types";
import { currentMonth, getLast12Months } from "@/lib/dashboardUtils";

function ProjectFilterDropdown({
  orgId,
  value,
  onChange,
}: {
  orgId: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const { data: projects } = useProjects(orgId);

  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? undefined : v)}
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="All Projects" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Projects</SelectItem>
        {projects?.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (p: DashboardPeriod) => void;
}) {
  const months = useMemo(() => getLast12Months(), []);
  const selectValue = value.type === "all_time" ? "all_time" : value.value;

  return (
    <Select
      value={selectValue}
      onValueChange={(v) =>
        onChange(v === "all_time" ? { type: "all_time" } : { type: "month", value: v })
      }
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all_time">All time</SelectItem>
        {months.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OrgDashboard() {
  const { currentOrg } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();

  // AIX-381: every org role (including plain members) gets the Team/Personal
  // tabs; the Team tab reads org-scoped stats, which the API allows any member.
  const activeTab = (searchParams.get("tab") as "team" | "personal") ?? "team";

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>({
    type: "month",
    value: currentMonth(),
  });

  const orgId = currentOrg?.id || "";
  const isAllTime = selectedPeriod.type === "all_time";

  const { data: stats, isLoading: isLoadingStats, isError: isErrorStats, refetch: refetchStats } = useOverviewStats(orgId, selectedProjectId, selectedPeriod);
  const { data: dailyData, isLoading: isLoadingDaily, isError: isErrorDaily, refetch: refetchDaily } = useDailyStats(
    orgId,
    selectedPeriod,
    30,
    isAllTime ? "month" : undefined,
    selectedProjectId,
  );
  const { data: eventsResponse, isLoading: isLoadingEvents, isError: isErrorEvents, refetch: refetchEvents } = useEvents(orgId, { per_page: 10 });

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

  const events: ActivityEvent[] = useMemo(
    () =>
      eventsResponse?.data?.map((e) => ({
        id: e.id,
        tool_name: e.toolName,
        event_type: e.eventType,
        attribution: e.attribution,
        risk_level: e.riskLevel,
        cost_usd: e.costUsd,
        created_at: e.occurredAt || e.createdAt,
        user: e.user ? { email: e.user.email } : undefined,
        project: e.project ? { name: e.project.name } : undefined,
      })) || [],
    [eventsResponse?.data]
  );

  const [toolInsightsDays, setToolInsightsDays] = useState(30);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleEventClick = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setDrawerOpen(true);
  }, []);

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!selectedEventId) return;
      const currentIndex = events.findIndex((e) => e.id === selectedEventId);
      if (currentIndex === -1) return;
      const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex >= 0 && newIndex < events.length) {
        setSelectedEventId(events[newIndex].id);
      }
    },
    [selectedEventId, events]
  );

  const selectedEventIndex = selectedEventId
    ? events.findIndex((e) => e.id === selectedEventId)
    : -1;

  const periodDesc = periodLabel(selectedPeriod);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-h2">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            AI tool usage and cost overview for {currentOrg?.name || "your organization"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "team" && (
            <>
              <ProjectFilterDropdown
                orgId={orgId}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
              />
              <PeriodSelector value={selectedPeriod} onChange={setSelectedPeriod} />
            </>
          )}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setSearchParams({ tab: v })}
          >
            <TabsList>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="personal">Personal</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {activeTab === "personal" ? (
        <MemberDashboard hideHeader />
      ) : (
        <>
          <WeeklyToolUsageChart orgId={orgId} projectId={selectedProjectId} externalPeriod={selectedPeriod} />

          {isErrorStats ? (
            <Card>
              <CardContent className="py-6">
                <ErrorState
                  title="Could not load stats"
                  description="Something went wrong fetching the dashboard metrics."
                  onRetry={() => refetchStats()}
                />
              </CardContent>
            </Card>
          ) : (
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
                stats?.events_change_percent != null
                  ? stats.events_change_percent > 0
                    ? "up"
                    : "down"
                  : "neutral"
              }
              trendValue={
                stats?.events_change_percent != null
                  ? formatPercent(Math.abs(stats.events_change_percent))
                  : undefined
              }
              description={periodDesc}
            />
            <MetricCard
              title="Total Cost"
              value={stats?.total_cost_usd ?? 0}
              format="currency"
              icon={<DollarSign className="size-5" />}
              trend={
                stats?.cost_change_percent != null
                  ? stats.cost_change_percent > 0
                    ? "up"
                    : "down"
                  : "neutral"
              }
              trendValue={
                stats?.cost_change_percent != null
                  ? formatPercent(Math.abs(stats.cost_change_percent))
                  : undefined
              }
              description={periodDesc}
            />
            <MetricCard
              title="Risk Alerts"
              value={stats?.risk_alerts ?? 0}
              format="number"
              icon={<AlertTriangle className="size-5" />}
              description={periodDesc}
            />
            <MetricCard
              title="Active Members"
              value={stats?.active_users ?? 0}
              format="number"
              icon={<Users className="size-5" />}
              description="Last 7 days"
            />
              </>
            )}
          </MetricGrid>
          )}

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <CostTrendChart data={chartData} isLoading={isLoadingDaily} isError={isErrorDaily} onRetry={() => refetchDaily()} allTime={isAllTime} />
            <ActivityFeed
              events={events}
              isLoading={isLoadingEvents}
              isError={isErrorEvents}
              onRetry={() => refetchEvents()}
              onEventClick={handleEventClick}
              selectedEventId={selectedEventId}
            />
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <TopToolsChart data={toolUsage} isLoading={isLoadingDaily} isError={isErrorDaily} onRetry={() => refetchDaily()} periodDesc={periodLabel(selectedPeriod)} />
            <RiskAlertsTable orgId={orgId} projectId={selectedProjectId} period={selectedPeriod} />
          </div>

          <ToolInsightsSection
            orgId={orgId}
            days={toolInsightsDays}
            onDaysChange={setToolInsightsDays}
          />

          <EventDrawer
            eventId={selectedEventId}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onNavigate={handleNavigate}
            hasPrev={selectedEventIndex > 0}
            hasNext={selectedEventIndex < events.length - 1}
          />
        </>
      )}
    </div>
  );
}
