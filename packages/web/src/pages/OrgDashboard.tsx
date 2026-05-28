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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberDashboard } from "@/pages/MemberDashboard";
import { StatCardSkeleton } from "@/components/ui/skeletons";
import { formatPercent } from "@/lib/formatters";

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

export function OrgDashboard() {
  const { currentOrg, hasRole } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwnerOrViewer = hasRole(["owner", "viewer"]);

  const activeTab = isOwnerOrViewer
    ? ((searchParams.get("tab") as "team" | "personal") ?? "team")
    : "team";

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  const orgId = currentOrg?.id || "";

  const { data: stats, isLoading: isLoadingStats } = useOverviewStats(orgId, selectedProjectId);
  const { data: dailyData, isLoading: isLoadingDaily } = useDailyStats(orgId, 30);
  const { data: eventsResponse, isLoading: isLoadingEvents } = useEvents(orgId, { per_page: 10 });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            AI tool usage and cost overview for {currentOrg?.name || "your organization"}
          </p>
        </div>
        {isOwnerOrViewer && (
          <div className="flex items-center gap-3">
            {activeTab === "team" && (
              <ProjectFilterDropdown
                orgId={orgId}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
              />
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
        )}
      </div>

      {activeTab === "personal" ? (
        <MemberDashboard hideHeader />
      ) : (
        <>
          <WeeklyToolUsageChart orgId={orgId} projectId={selectedProjectId} />

          <MetricGrid>
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
                    ? "up"
                    : "down"
                  : "neutral"
              }
              trendValue={
                stats?.cost_change_percent
                  ? formatPercent(Math.abs(stats.cost_change_percent))
                  : undefined
              }
              description="This month"
            />
            <MetricCard
              title="Risk Alerts"
              value={stats?.risk_alerts ?? 0}
              format="number"
              icon={<AlertTriangle className="size-5" />}
              description="This month"
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

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <CostTrendChart data={chartData} isLoading={isLoadingDaily} />
            <ActivityFeed
              events={events}
              isLoading={isLoadingEvents}
              onEventClick={handleEventClick}
              selectedEventId={selectedEventId}
            />
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <TopToolsChart data={toolUsage} isLoading={isLoadingDaily} />
            <RiskAlertsTable orgId={orgId} projectId={selectedProjectId} />
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
