import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, DollarSign, AlertTriangle, Users } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useOverviewStats, useActiveUsers, useDailyStats, useEvents, useProjects, clientTimezone } from "@/hooks/useApi";
import {
  MetricCard,
  MetricGrid,
  CostTrendChart,
  ActivityFeed,
  TopToolsChart,
  ToolInsightsSection,
  WeeklyToolUsageChart,
  RiskAlertsTable,
  ProjectFilterDropdown,
  MemberPeriodSelect,
  type MemberPeriod,
  type DailyCostData,
  type ActivityEvent,
  type ToolUsageData,
} from "@/components/dashboard";
import { EventDrawer } from "@/components/events";
import { TabNav } from "@/components/ui/tab-nav";
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
import { currentMonth, getLast12Months, isCurrentMonth, periodToDateRange } from "@/lib/dashboardUtils";
import { AppRoutes } from "@/lib/routes";

// Active Members intentionally uses a fixed rolling window, not the month filter,
// so the number stays stable while users explore historical months.
const ACTIVE_USERS_WINDOW_DAYS = 7;

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
  // Personal tab keeps its own scope (rolling-day windows) but its filter bar is
  // rendered from this shared header so the chrome matches the Team tab (AIX-607).
  const [personalPeriod, setPersonalPeriod] = useState<MemberPeriod>("30d");
  const [personalProjectId, setPersonalProjectId] = useState<string | undefined>();

  const orgId = currentOrg?.id || "";
  const isAllTime = selectedPeriod.type === "all_time";
  // AIX-496: the Cost Trend chart has its own Last 7/30 Days window, which should
  // stay a true trailing window (crossing into the previous month if needed) when the
  // current month is selected — only historical months stay clamped to the calendar month.
  const isCurrentMonthSelected = selectedPeriod.type === "month" && isCurrentMonth(selectedPeriod.value);
  const dailyStatsPeriod = isCurrentMonthSelected ? undefined : selectedPeriod;

  // AIX-530: selectedProjectId belongs to whichever org it was picked under.
  // Switching orgs must clear it, or dashboard requests keep scoping to a
  // project that doesn't belong to the newly selected org, causing 404s.
  const [prevOrgId, setPrevOrgId] = useState(orgId);
  if (orgId !== prevOrgId) {
    setPrevOrgId(orgId);
    setSelectedProjectId(undefined);
    setPersonalProjectId(undefined);
  }

  const { data: projects } = useProjects(orgId);
  const { data: stats, isLoading: isLoadingStats, isError: isErrorStats, refetch: refetchStats } = useOverviewStats(orgId, selectedProjectId, selectedPeriod);
  // Active Members is intentionally pinned to a rolling window, not the month selector.
  const { data: activeUsersData } = useActiveUsers(orgId, selectedProjectId, ACTIVE_USERS_WINDOW_DAYS);
  const { data: dailyData, isLoading: isLoadingDaily, isError: isErrorDaily, refetch: refetchDaily } = useDailyStats(
    orgId,
    dailyStatsPeriod,
    30,
    isAllTime ? "month" : undefined,
    selectedProjectId,
  );
  const eventsFilters = useMemo(
    () => ({
      per_page: 10,
      ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
      ...periodToDateRange(selectedPeriod),
      tz: clientTimezone,
    }),
    [selectedProjectId, selectedPeriod],
  );

  const activityViewAllTo = useMemo(() => {
    const { start_date, end_date } = periodToDateRange(selectedPeriod);
    const params = new URLSearchParams({
      ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
      ...(start_date ? { date_from: start_date } : {}),
      ...(end_date ? { date_to: end_date } : {}),
    });
    const query = params.toString();
    return query ? `${AppRoutes.events.root}?${query}` : AppRoutes.events.root;
  }, [selectedProjectId, selectedPeriod]);
  const { data: eventsResponse, isLoading: isLoadingEvents, isError: isErrorEvents, refetch: refetchEvents } = useEvents(orgId, eventsFilters);

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

  const activitySubtitle = useMemo(() => {
    const period = periodLabel(selectedPeriod);
    let base: string;
    if (!selectedProjectId) base = "Latest events across your organization";
    else if (selectedProjectId === "none") base = "Latest events not assigned to a project";
    else {
      const name = projects?.find((p) => p.id === selectedProjectId)?.name;
      base = name ? `Latest events in ${name}` : "Latest events for the selected project";
    }
    return `${base} · ${period}`;
  }, [selectedProjectId, selectedPeriod, projects]);

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
            Tool usage and cost overview for {currentOrg?.name || "your organization"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "team" ? (
            <>
              <ProjectFilterDropdown
                orgId={orgId}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
              />
              <PeriodSelector value={selectedPeriod} onChange={setSelectedPeriod} />
            </>
          ) : (
            <>
              <ProjectFilterDropdown
                orgId={orgId}
                value={personalProjectId}
                onChange={setPersonalProjectId}
              />
              <MemberPeriodSelect value={personalPeriod} onChange={setPersonalPeriod} />
            </>
          )}
          <TabNav
            tabs={[
              { label: "Team", key: "team" },
              { label: "Personal", key: "personal" },
            ]}
            variant="default"
            activeTab={activeTab}
            onChange={(v) => setSearchParams({ tab: v })}
          />
        </div>
      </div>

      {activeTab === "personal" ? (
        <MemberDashboard hideHeader period={personalPeriod} projectId={personalProjectId} />
      ) : selectedProjectId &&
        !isLoadingStats &&
        !stats?.total_events ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          {selectedProjectId === "none"
            ? "No unattributed events in this period."
            : "No data for the selected project in this period."}
        </div>
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
              value={activeUsersData?.active_users ?? 0}
              format="number"
              icon={<Users className="size-5" />}
              description={`Last ${ACTIVE_USERS_WINDOW_DAYS} days`}
            />
              </>
            )}
          </MetricGrid>
          )}

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <CostTrendChart
              data={chartData}
              isLoading={isLoadingDaily}
              isError={isErrorDaily}
              onRetry={() => refetchDaily()}
              allTime={isAllTime}
              monthScoped={selectedPeriod.type === "month" && !isCurrentMonthSelected}
            />
            <ActivityFeed
              subtitle={activitySubtitle}
              events={events}
              isLoading={isLoadingEvents}
              isError={isErrorEvents}
              onRetry={() => refetchEvents()}
              onEventClick={handleEventClick}
              selectedEventId={selectedEventId}
              viewAllTo={activityViewAllTo}
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
            projectId={selectedProjectId}
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
